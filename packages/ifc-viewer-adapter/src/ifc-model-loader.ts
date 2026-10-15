import type { GeometryProcessor, MeshData } from "@ifc-lite/geometry";
import {
  extractGeoreferencingOnDemand,
  type IfcDataStore,
  type IfcParser,
  type ParseOptions,
} from "@ifc-lite/parser";
import type { FederationRegistry, Renderer } from "@ifc-lite/renderer";

import type { IfcBimIndex } from "./bim-index";
import { classifyIfcGeoreferencing } from "./georeferencing";
import { createServerDataStore } from "./server-data-store";
import { toBrowserMeshBatch } from "./server-geometry";
import type {
  IfcModelSnapshot,
  IfcProcessingSnapshot,
  IfcViewerRuntime,
  IfcViewerSnapshot,
  LoadIfcInput,
} from "./viewer-types";

export type LoadedIfcModel = {
  assetId: string;
  store: IfcDataStore;
  bimIndex: IfcBimIndex;
  meshIds: Set<number>;
  processing: IfcProcessingSnapshot;
  modelIndex: number;
};

type IfcModelLoaderHost = {
  renderer: Renderer;
  federation: FederationRegistry;
  models: Map<string, LoadedIfcModel>;
  runtime: Pick<
    IfcViewerRuntime,
    | "fetch"
    | "createGeometryProcessor"
    | "createParser"
    | "createServerClient"
    | "createBimIndex"
  >;
  initialize: () => Promise<void>;
  isDisposed: () => boolean;
  getSnapshot: () => IfcViewerSnapshot;
  updateSnapshot: (update: Partial<IfcViewerSnapshot>) => void;
  updateModelSnapshot: (
    assetId: string,
    update: Partial<IfcModelSnapshot>,
  ) => void;
  onModelReady: () => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Le chargement de la maquette a échoué.";
}

/** Owns IFC parsing, geometry streaming and the load transaction. */
export class IfcModelLoader {
  private readonly geometry: GeometryProcessor;
  private readonly parser: IfcParser;
  private loadQueue: Promise<void> = Promise.resolve();
  private loadGeneration = 0;
  private currentDownload: AbortController | null = null;
  private nextModelIndex = 0;
  private sharedRtcOffset: { x: number; y: number; z: number } | null = null;

  constructor(private readonly host: IfcModelLoaderHost) {
    this.geometry = host.runtime.createGeometryProcessor();
    this.parser = host.runtime.createParser();
  }

  get generation() {
    return this.loadGeneration;
  }

  initGeometry() {
    return this.geometry.init();
  }

  load(input: LoadIfcInput) {
    const run = this.loadQueue
      .catch(() => undefined)
      .then(() => {
        if (this.host.models.has(input.assetId)) {
          throw new Error(`La maquette ${input.fileName} est déjà chargée.`);
        }
        return this.runLoad(input, ++this.loadGeneration);
      });
    this.loadQueue = run;
    return run;
  }

  isCurrentLoad(generation: number) {
    return !this.host.isDisposed() && generation === this.loadGeneration;
  }

  dispose() {
    this.loadGeneration += 1;
    this.currentDownload?.abort();
    this.currentDownload = null;
    this.geometry.dispose();
  }

  private async runLoad(input: LoadIfcInput, generation: number) {
    await this.host.initialize();
    if (!this.isCurrentLoad(generation)) return;

    this.currentDownload = new AbortController();
    this.host.updateModelSnapshot(input.assetId, {
      assetId: input.assetId,
      fileName: input.fileName,
      phase: "downloading",
      meshCount: 0,
      entityCount: null,
      message: null,
    });
    this.host.updateSnapshot({
      phase: "downloading",
      parserPercent: null,
      message: null,
    });
    const meshIds = new Set<number>();
    let registered = false;

    try {
      const processing = input.processing ?? { engine: "browser" };
      const modelIndex = this.nextModelIndex++;
      const processingSnapshot: IfcProcessingSnapshot = {
        engine: processing.engine,
        cacheKey: null,
        cacheHit: null,
      };
      let store: IfcDataStore;
      let offset: number;
      let georeferencing;
      let result: IfcProcessingSnapshot | undefined;
      if (processing.engine === "rust") {
        // The browser never downloads or parses a large IFC. Reserve a non-overlapping
        // Express ID range before the first streamed geometry batch arrives.
        const reservedIds = 200_000_000;
        offset = this.host.federation.registerModel(input.assetId, reservedIds);
        registered = true;
        this.host.updateModelSnapshot(input.assetId, { phase: "processing" });
        this.host.updateSnapshot({ phase: "processing" });
        const streamed = await this.streamServerGeometry(
          processing.serverBaseUrl,
          generation,
          input.assetId,
          offset,
          modelIndex,
          meshIds,
        );
        if (!this.isCurrentLoad(generation)) return;
        if (!streamed) return;
        if (streamed.maxExpressId > reservedIds)
          throw new Error("Identifiants IFC hors de la plage de fédération.");
        store = createServerDataStore(
          streamed.dataModel,
          streamed.result.metadata.schema_version,
          0,
          streamed.result.metadata.entity_count,
        );
        const geo = streamed.result.metadata.georeferencing;
        georeferencing =
          geo?.source === "siteLocation"
            ? { kind: "site-only" as const, crs: null }
            : geo?.crs_name
              ? { kind: "projected" as const, crs: geo.crs_name }
              : { kind: "local" as const, crs: null };
        result = {
          engine: "rust",
          cacheKey: streamed.result.cache_key,
          cacheHit: streamed.result.stats.from_cache,
        };
      } else {
        const response = await this.host.runtime.fetch(input.downloadUrl, {
          signal: this.currentDownload.signal,
        });
        if (!response.ok)
          throw new Error(`Le stockage a répondu HTTP ${response.status}.`);
        const source = await response.arrayBuffer();
        if (!this.isCurrentLoad(generation)) return;
        this.host.updateModelSnapshot(input.assetId, { phase: "processing" });
        this.host.updateSnapshot({ phase: "processing" });
        const parserOptions: ParseOptions = {
          onProgress: ({ percent }) => {
            if (this.isCurrentLoad(generation))
              this.host.updateSnapshot({ parserPercent: Math.round(percent) });
          },
        };
        store = await this.parser.parseColumnar(source, parserOptions);
        if (!this.isCurrentLoad(generation)) return;
        georeferencing = classifyIfcGeoreferencing(
          extractGeoreferencingOnDemand(store),
        );
        let maxExpressId = 0;
        for (const id of store.entityIndex.byId.keys())
          if (id > maxExpressId) maxExpressId = id;
        offset = this.host.federation.registerModel(
          input.assetId,
          maxExpressId,
        );
        registered = true;
        await this.streamBrowserGeometry(
          new Uint8Array(source),
          generation,
          input.assetId,
          offset,
          modelIndex,
          meshIds,
        );
      }

      if (!this.isCurrentLoad(generation)) return;

      const bimIndex = this.host.runtime.createBimIndex(
        store,
        [...meshIds].map((id) => id - offset),
      );
      if (result) Object.assign(processingSnapshot, result);
      this.host.models.set(input.assetId, {
        assetId: input.assetId,
        store,
        bimIndex,
        meshIds,
        processing: processingSnapshot,
        modelIndex,
      });
      const activeModelId =
        this.host.getSnapshot().activeModelId ?? input.assetId;
      this.host.updateModelSnapshot(input.assetId, {
        phase: "ready",
        entityCount: store.entityCount,
        catalog: bimIndex.catalog,
        georeferencing,
      });
      this.host.onModelReady();
      if (activeModelId === input.assetId) {
        this.host.updateSnapshot({
          activeModelId,
          catalog: bimIndex.catalog,
          processing: processingSnapshot,
        });
      }
      this.host.renderer.requestRender();
      this.host.updateSnapshot({
        phase: "ready",
        parserPercent: 100,
        entityCount: this.host
          .getSnapshot()
          .models.reduce((count, model) => count + (model.entityCount ?? 0), 0),
        message: null,
      });
    } catch (error) {
      if (!this.isCurrentLoad(generation)) return;

      if (meshIds.size) {
        this.host.renderer.getScene().removeMeshesForEntities(meshIds);
      }
      if (registered) this.host.federation.unregisterModel(input.assetId);
      this.host.updateModelSnapshot(input.assetId, {
        phase: "error",
        message: errorMessage(error),
      });
      this.host.updateSnapshot({
        phase: this.host.models.size ? "ready" : "error",
        message: errorMessage(error),
      });
      throw error;
    } finally {
      if (this.isCurrentLoad(generation)) this.currentDownload = null;
    }
  }

  private async streamBrowserGeometry(
    source: Uint8Array,
    generation: number,
    assetId: string,
    offset: number,
    modelIndex: number,
    meshIds: Set<number>,
  ) {
    for await (const event of this.geometry.processAdaptive(source, {
      ...(this.sharedRtcOffset
        ? { sharedRtcOffset: this.sharedRtcOffset }
        : {}),
    })) {
      if (!this.isCurrentLoad(generation)) return;
      if (event.type === "batch") {
        this.addMeshes(assetId, event.meshes, offset, modelIndex, meshIds);
      }
      if (event.type === "complete" && !this.sharedRtcOffset) {
        this.sharedRtcOffset = event.coordinateInfo.wasmRtcOffset ?? null;
      }
    }
  }

  private async streamServerGeometry(
    serverBaseUrl: string,
    generation: number,
    assetId: string,
    offset: number,
    modelIndex: number,
    meshIds: Set<number>,
  ) {
    const client = this.host.runtime.createServerClient(serverBaseUrl);
    const streamed = await client.stream((batch) => {
      if (!this.isCurrentLoad(generation)) return;
      const meshes = toBrowserMeshBatch(batch.meshes);
      this.addMeshes(assetId, meshes, offset, modelIndex, meshIds);
    }, this.currentDownload?.signal);

    if (!this.isCurrentLoad(generation)) return;
    const result = streamed.result;
    const [x, y, z] = result.metadata.coordinate_info?.origin_shift ?? [
      0, 0, 0,
    ];
    if (!this.sharedRtcOffset && (x || y || z)) {
      this.sharedRtcOffset = { x, y, z };
    } else if (this.sharedRtcOffset) {
      const delta: [number, number, number] = [
        x - this.sharedRtcOffset.x,
        z - this.sharedRtcOffset.z,
        -(y - this.sharedRtcOffset.y),
      ];
      if (delta.some((value) => value !== 0)) {
        this.host.renderer
          .getScene()
          .translateMeshesForEntities(
            new Map([...meshIds].map((id) => [id, delta])),
          );
      }
    }
    return streamed;
  }

  private addMeshes(
    assetId: string,
    meshes: MeshData[],
    offset: number,
    modelIndex: number,
    meshIds: Set<number>,
  ) {
    if (!meshes.length) return;
    const federated = meshes.map((mesh) => {
      const globalId = mesh.expressId + offset;
      meshIds.add(globalId);
      return {
        ...mesh,
        expressId: globalId,
        modelIndex,
        ...(mesh.geometryItemId !== undefined
          ? { geometryItemId: mesh.geometryItemId + offset }
          : {}),
        ...(mesh.entityIds
          ? { entityIds: mesh.entityIds.map((id) => id + offset) }
          : {}),
        ...(mesh.textureRef
          ? {
              textureRef: {
                ...mesh.textureRef,
                textureId: mesh.textureRef.textureId + offset,
              },
            }
          : {}),
      } satisfies MeshData;
    });
    this.host.renderer.addMeshes(federated, true);
    const current = this.host
      .getSnapshot()
      .models.find((model) => model.assetId === assetId);
    this.host.updateModelSnapshot(assetId, {
      meshCount: (current?.meshCount ?? 0) + federated.length,
    });
    this.host.updateSnapshot({
      meshCount: this.host.getSnapshot().meshCount + federated.length,
    });
    this.host.renderer.requestRender();
  }
}
