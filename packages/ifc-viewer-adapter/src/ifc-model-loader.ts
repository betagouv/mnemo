import type {
  GeometryProcessor,
  MeshData,
  SpatialFrameOffset,
} from "@ifc-lite/geometry";
import type { IfcDataStore, IfcParser } from "@ifc-lite/parser";
import type { FederationRegistry, Renderer } from "@ifc-lite/renderer";

import type { IfcBimIndex } from "./bim-index";
import { FederatedMeshes } from "./federated-meshes";
import { classifyIfcGeoreferencing } from "./georeferencing";
import {
  readBrowserIfc,
  readServerIfc,
  type IfcContent,
  type IfcReadSession,
} from "./ifc-engines";
import type { ModelAlignment } from "./model-alignment";
import type { ProjectFrame } from "./project-frame";
import {
  createScenePlacement,
  projectOrigin,
  type ScenePlacement,
} from "./scene-placement";
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
  /** Convert an authored elevation to the scene's vertical axis. */
  sceneElevation: ScenePlacement["elevation"];
};

type IfcModelLoaderHost = {
  renderer: Renderer;
  federation: FederationRegistry;
  models: Map<string, LoadedIfcModel>;
  projectFrame: ProjectFrame;
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

const placedBatchSize = 500;

function* batches<T>(items: readonly T[], size: number) {
  for (let start = 0; start < items.length; start += size)
    yield items.slice(start, start + size);
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

type PlacedModel = {
  placement: ScenePlacement;
  issues: ModelAlignment["issues"];
};

/** Owns the load transaction: read, place, consolidate, publish or roll back. */
export class IfcModelLoader {
  private readonly geometry: GeometryProcessor;
  private readonly parser: IfcParser;
  private loadQueue: Promise<void> = Promise.resolve();
  private loadGeneration = 0;
  private currentDownload: AbortController | null = null;
  private nextModelIndex = 0;
  private sceneOrigin: SpatialFrameOffset | null = null;

  constructor(private readonly host: IfcModelLoaderHost) {
    this.geometry = host.runtime.createGeometryProcessor();
    this.parser = host.runtime.createParser();
  }

  /** Project coordinates (Z up) of the scene origin. */
  get renderOrigin() {
    return this.sceneOrigin ?? { x: 0, y: 0, z: 0 };
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

    const download = new AbortController();
    const { signal } = download;
    this.currentDownload = download;
    this.startSnapshot(input);
    const meshes = new FederatedMeshes(
      this.host,
      input.assetId,
      this.nextModelIndex++,
    );

    try {
      // Georeferencing and RTC are complete only when the geometry ends. Show the
      // first model progressively when its coordinates are the project's, and hold
      // the others until they can be placed.
      const progressive =
        !this.sceneOrigin &&
        this.host.projectFrame.keepsAuthoredCoordinates(input.assetId);
      const authored: MeshData[] = [];
      const content = await this.read(input, {
        signal,
        onProcessing: () => {
          this.host.updateModelSnapshot(input.assetId, { phase: "processing" });
          this.host.updateSnapshot({ phase: "processing" });
        },
        onParserPercent: (parserPercent) => {
          if (!signal.aborted) this.host.updateSnapshot({ parserPercent });
        },
        reserveIds: (maxExpressId) => meshes.reserveIds(maxExpressId),
        onMeshes: (batch) => {
          if (signal.aborted) return;
          for (const mesh of batch) authored.push(mesh);
          this.countMeshes(input.assetId, batch.length);
          if (progressive) meshes.add(batch);
        },
      });
      const placed = await this.position(
        input.assetId,
        content,
        authored,
        signal,
      );
      if (progressive && placed.placement.moves)
        throw new Error(
          "Le repère du projet vient d’être défini dans une autre session. Réessayez le chargement.",
        );
      if (!progressive)
        for (const batch of batches(authored, placedBatchSize)) {
          meshes.add(batch.map(placed.placement.place));
          await nextTask();
          signal.throwIfAborted();
        }
      this.sceneOrigin = placed.origin;
      await this.consolidateScene(signal);
      this.publish(input.assetId, content, meshes, placed);
    } catch (error) {
      if (!this.isCurrentLoad(generation)) return;

      download.abort();
      meshes.discard();
      this.reportFailure(input.assetId, error);
      throw error;
    } finally {
      if (this.isCurrentLoad(generation)) this.currentDownload = null;
    }
  }

  private read(
    { downloadUrl, processing }: LoadIfcInput,
    session: IfcReadSession,
  ) {
    const { runtime } = this.host;
    return processing?.engine === "rust"
      ? readServerIfc(
          runtime.createServerClient(processing.serverBaseUrl),
          session,
        )
      : readBrowserIfc(
          {
            fetch: runtime.fetch,
            parser: this.parser,
            geometry: this.geometry,
          },
          downloadUrl,
          session,
        );
  }

  private async position(
    assetId: string,
    { georeference, lengthUnitScale, rtc }: IfcContent,
    meshes: readonly MeshData[],
    signal: AbortSignal,
  ): Promise<PlacedModel & { origin: SpatialFrameOffset }> {
    const { transform, issues } = await this.host.projectFrame.position({
      assetId,
      georeference,
      lengthUnitScale,
      rtc,
      meshes,
    });
    signal.throwIfAborted();
    const origin = this.sceneOrigin ?? projectOrigin(transform, rtc);
    return {
      origin,
      placement: createScenePlacement(transform, rtc, origin),
      issues,
    };
  }

  /**
   * Streaming fragments cannot be partitioned for per-entity transparency.
   * Consolidate them before enabling model controls, keeping the camera intact.
   */
  private async consolidateScene(signal: AbortSignal) {
    const { renderer } = this.host;
    const device = renderer.getGPUDevice();
    const pipeline = renderer.getPipeline();
    if (!device || !pipeline) return;
    await renderer.getScene().finalizeStreamingAsync(device, pipeline);
    signal.throwIfAborted();
    renderer.clearCaches();
  }

  private publish(
    assetId: string,
    content: IfcContent,
    meshes: FederatedMeshes,
    { placement, issues }: PlacedModel,
  ) {
    const { store, processing } = content;
    const bimIndex = this.host.runtime.createBimIndex(
      store,
      meshes.expressIds(),
    );
    this.host.models.set(assetId, {
      assetId,
      store,
      bimIndex,
      meshIds: meshes.ids,
      processing,
      modelIndex: meshes.modelIndex,
      sceneElevation: placement.elevation,
    });
    const activeModelId = this.host.getSnapshot().activeModelId ?? assetId;
    this.host.updateModelSnapshot(assetId, {
      phase: "ready",
      entityCount: store.entityCount,
      catalog: bimIndex.catalog,
      georeferencing: classifyIfcGeoreferencing(content.georeference),
      positioningIssues: issues,
      skippedElements: content.skippedElements,
    });
    this.host.onModelReady();
    if (activeModelId === assetId) {
      this.host.updateSnapshot({
        activeModelId,
        catalog: bimIndex.catalog,
        processing,
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
  }

  private startSnapshot({ assetId, fileName }: LoadIfcInput) {
    this.host.updateModelSnapshot(assetId, {
      assetId,
      fileName,
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
  }

  private reportFailure(assetId: string, error: unknown) {
    const message = errorMessage(error);
    this.countMeshes(assetId, -this.receivedMeshes(assetId));
    this.host.updateModelSnapshot(assetId, { phase: "error", message });
    this.host.updateSnapshot({
      phase: this.host.models.size ? "ready" : "error",
      message,
    });
  }

  private receivedMeshes(assetId: string) {
    return (
      this.host.getSnapshot().models.find((model) => model.assetId === assetId)
        ?.meshCount ?? 0
    );
  }

  private countMeshes(assetId: string, count: number) {
    this.host.updateModelSnapshot(assetId, {
      meshCount: this.receivedMeshes(assetId) + count,
    });
    this.host.updateSnapshot({
      meshCount: this.host.getSnapshot().meshCount + count,
    });
  }
}
