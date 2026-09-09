import {
  GeometryProcessor,
  type StreamingGeometryEvent,
} from "@ifc-lite/geometry";
import {
  extractEntityAttributesOnDemand,
  extractPropertiesOnDemand,
  extractQuantitiesOnDemand,
  IfcParser,
  type IfcDataStore,
  type ParseOptions,
} from "@ifc-lite/parser";
import { Renderer, type PointCloudAssetHandle } from "@ifc-lite/renderer";
import {
  composePointCloudTransform,
  createPointCloudStream,
  detectPointCloudFormat,
  type PointCloudFormat,
  type PointCloudStreamHandle,
  type PointCloudStreamOptions,
  type PointCloudTransform,
} from "@mnemo/point-cloud-viewer-adapter";

import {
  createIfcBimIndex,
  type IfcBimCatalog,
  type IfcBimIndex,
  type IfcBimQuery,
  type IfcElementSummary,
} from "./bim-index";
import {
  createIfcServerGeometryClient,
  type IfcServerGeometryClient,
  toBrowserMeshBatch,
} from "./server-geometry";

const maxCanvasDimension = 8_192;

export type IfcViewerPhase =
  | "idle"
  | "initializing"
  | "downloading"
  | "processing"
  | "ready"
  | "error"
  | "device_lost";

export type IfcViewerSnapshot = {
  phase: IfcViewerPhase;
  parserPercent: number | null;
  meshCount: number;
  entityCount: number | null;
  message: string | null;
  selection: IfcElementDetails | null;
  selectionPhase: "idle" | "loading" | "ready" | "error";
  selectionMessage: string | null;
  catalog: IfcBimCatalog | null;
  processing: IfcProcessingSnapshot;
  visual: IfcVisualSnapshot;
  pointClouds: PointCloudSnapshot[];
  pointCloudOptions: PointCloudOptionsSnapshot;
};

export type PointCloudPhase = "downloading" | "streaming" | "ready" | "error";

export type PointCloudSnapshot = {
  assetId: string;
  fileName: string;
  format: PointCloudFormat;
  phase: PointCloudPhase;
  progress: number;
  pointCount: number;
  totalPointCount: number | null;
  sampleStride: number;
  message: string | null;
};

export type PointCloudOptionsSnapshot = {
  pointSize: number;
};

export type IfcProcessingEngine = "browser" | "rust";

export type IfcProcessingSnapshot = {
  engine: IfcProcessingEngine | null;
  cacheKey: string | null;
  cacheHit: boolean | null;
};

export type IfcVisualMode = "all" | "isolate" | "hide" | "color";

export type IfcVisualSnapshot = {
  mode: IfcVisualMode;
  label: string | null;
  matchCount: number;
  showContext: boolean;
  contextOpacity: number;
};

export type IfcVisualColorGroup = {
  ids: Iterable<number>;
  color: readonly [number, number, number, number];
};

export type IfcVisualPlan = {
  focusIds?: Iterable<number> | null;
  hiddenIds?: Iterable<number>;
  colors?: Iterable<IfcVisualColorGroup>;
  showContext?: boolean;
  contextOpacity?: number;
  label?: string | null;
};

export type IfcPropertyValue =
  string | number | boolean | null | IfcPropertyValue[];

export type IfcValueItem = {
  name: string;
  type: number;
  value: IfcPropertyValue;
  values?: string[];
  unit?: string;
  dataType?: string;
};

export type IfcValueSet = {
  name: string;
  globalId?: string;
  values: IfcValueItem[];
};

export type IfcElementDetails = {
  expressId: number;
  globalId: string;
  ifcClass: string;
  name: string;
  description: string;
  objectType: string;
  tag: string;
  propertySets: IfcValueSet[];
  quantitySets: IfcValueSet[];
};

export type LoadIfcInput = {
  downloadUrl: string;
  processing?:
    { engine: "browser" } | { engine: "rust"; serverBaseUrl: string };
};

export type LoadPointCloudInput = {
  assetId: string;
  fileName: string;
  downloadUrl: string;
  maxPointsInMemory: number;
  transform: PointCloudTransform;
};

type FrameRequest = (callback: FrameRequestCallback) => number;
type FrameCancel = (handle: number) => void;

export type IfcViewerRuntime = {
  createRenderer: (canvas: HTMLCanvasElement) => Renderer;
  createGeometryProcessor: () => GeometryProcessor;
  createParser: () => IfcParser;
  createServerClient: (serverBaseUrl: string) => IfcServerGeometryClient;
  readElementDetails: (
    store: IfcDataStore,
    expressId: number,
  ) => IfcElementDetails | null;
  createBimIndex: (
    store: IfcDataStore,
    renderableIds: Iterable<number>,
  ) => IfcBimIndex;
  createPointCloudStream: (
    options: PointCloudStreamOptions,
  ) => PointCloudStreamHandle;
  fetch: typeof fetch;
  requestFrame: FrameRequest;
  cancelFrame: FrameCancel;
  createResizeObserver: (
    callback: ResizeObserverCallback,
  ) => Pick<ResizeObserver, "observe" | "disconnect">;
};

const defaultSnapshot: IfcViewerSnapshot = {
  phase: "idle",
  parserPercent: null,
  meshCount: 0,
  entityCount: null,
  message: null,
  selection: null,
  selectionPhase: "idle",
  selectionMessage: null,
  catalog: null,
  processing: {
    engine: null,
    cacheKey: null,
    cacheHit: null,
  },
  visual: {
    mode: "all",
    label: null,
    matchCount: 0,
    showContext: true,
    contextOpacity: 0.1,
  },
  pointClouds: [],
  pointCloudOptions: {
    pointSize: 2,
  },
};

function readElementDetails(
  store: IfcDataStore,
  expressId: number,
): IfcElementDetails | null {
  if (!store.entityIndex.byId.has(expressId)) return null;

  const attributes = extractEntityAttributesOnDemand(store, expressId);

  return {
    expressId,
    globalId: attributes.globalId || store.entities.getGlobalId(expressId),
    ifcClass:
      store.entities.getTypeName(expressId) ||
      store.getEntity(expressId)?.type ||
      "IfcEntity",
    name: attributes.name || store.entities.getName(expressId),
    description: attributes.description,
    objectType: attributes.objectType,
    tag: attributes.tag,
    propertySets: extractPropertiesOnDemand(store, expressId).map((set) => ({
      name: set.name,
      globalId: set.globalId,
      values: set.properties.map((property) => ({
        name: property.name,
        type: property.type,
        value: property.value,
        values: property.values,
        dataType: property.dataType,
      })),
    })),
    quantitySets: extractQuantitiesOnDemand(store, expressId).map((set) => ({
      name: set.name,
      globalId: set.globalId,
      values: set.quantities.map((quantity) => ({
        name: quantity.name,
        type: quantity.type,
        value: quantity.value,
      })),
    })),
  };
}

function createDefaultRuntime(): IfcViewerRuntime {
  return {
    createRenderer: (canvas) => new Renderer(canvas),
    createGeometryProcessor: () => new GeometryProcessor(),
    createParser: () => new IfcParser(),
    createServerClient: createIfcServerGeometryClient,
    readElementDetails,
    createBimIndex: createIfcBimIndex,
    createPointCloudStream,
    fetch: globalThis.fetch.bind(globalThis),
    requestFrame: globalThis.requestAnimationFrame.bind(globalThis),
    cancelFrame: globalThis.cancelAnimationFrame.bind(globalThis),
    createResizeObserver: (callback) => new ResizeObserver(callback),
  };
}

function alignCanvasWidth(width: number) {
  return Math.min(
    maxCanvasDimension,
    Math.max(64, Math.floor(Math.max(1, width) / 64) * 64),
  );
}

function clampCanvasHeight(height: number) {
  return Math.min(maxCanvasDimension, Math.max(1, Math.floor(height)));
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Le chargement de la maquette a échoué.";
}

export class IfcViewerController {
  private readonly renderer: Renderer;
  private readonly geometry: GeometryProcessor;
  private readonly parser: IfcParser;
  private readonly listeners = new Set<(snapshot: IfcViewerSnapshot) => void>();
  private readonly runtime: IfcViewerRuntime;
  private snapshot: IfcViewerSnapshot = defaultSnapshot;
  private store: IfcDataStore | null = null;
  private bimIndex: IfcBimIndex | null = null;
  private initialization: Promise<void> | null = null;
  private loadQueue: Promise<void> = Promise.resolve();
  private loadGeneration = 0;
  private currentDownload: AbortController | null = null;
  private resizeObserver: Pick<
    ResizeObserver,
    "observe" | "disconnect"
  > | null = null;
  private frameHandle: number | null = null;
  private lastFrameTime: number | null = null;
  private unsubscribeDeviceLoss: (() => void) | null = null;
  private disposed = false;
  private pointerMode: "orbit" | "pan" | null = null;
  private pointerId: number | null = null;
  private pointerMoved = false;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private pointerX = 0;
  private pointerY = 0;
  private selectionGeneration = 0;
  private hiddenIds = new Set<number>();
  private isolatedIds: Set<number> | null = null;
  private ghostExceptIds: Set<number> | null = null;
  private colorOverrides = new Map<number, [number, number, number, number]>();
  private readonly pointCloudLoads = new Map<
    string,
    {
      abort: AbortController;
      expressId: number;
      handle: PointCloudAssetHandle | null;
      stream: PointCloudStreamHandle | null;
      transform: PointCloudTransform;
    }
  >();
  private nextPointCloudExpressId = 0xf0000000;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    runtime: IfcViewerRuntime = createDefaultRuntime(),
  ) {
    this.runtime = runtime;
    this.renderer = runtime.createRenderer(canvas);
    this.geometry = runtime.createGeometryProcessor();
    this.parser = runtime.createParser();
  }

  subscribe(listener: (snapshot: IfcViewerSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  getStore() {
    return this.store;
  }

  queryBim(query: IfcBimQuery): IfcElementSummary[] {
    return this.bimIndex?.query(query) ?? [];
  }

  findBimIds(query: IfcBimQuery): number[] {
    return this.bimIndex?.findIds(query) ?? [];
  }

  init() {
    if (this.disposed) {
      return Promise.reject(new Error("The IFC viewer has been disposed"));
    }

    this.initialization ??= this.initialize();
    return this.initialization;
  }

  loadIfc(input: LoadIfcInput) {
    const generation = ++this.loadGeneration;
    this.currentDownload?.abort();

    const run = this.loadQueue
      .catch(() => undefined)
      .then(() => this.runIfcLoad(input, generation));
    this.loadQueue = run;
    return run;
  }

  async loadPointCloud(input: LoadPointCloudInput) {
    await this.init();
    if (this.disposed) return;

    const format = detectPointCloudFormat(input.fileName);
    if (!format) {
      throw new Error(
        `Format de nuage de points non pris en charge : ${input.fileName}`,
      );
    }

    this.removePointCloud(input.assetId);
    const load = {
      abort: new AbortController(),
      expressId: this.nextPointCloudExpressId--,
      handle: null as PointCloudAssetHandle | null,
      stream: null as PointCloudStreamHandle | null,
      transform: input.transform,
    };
    this.pointCloudLoads.set(input.assetId, load);
    this.updatePointCloudSnapshot(input.assetId, {
      assetId: input.assetId,
      fileName: input.fileName,
      format,
      phase: "downloading",
      progress: 0,
      pointCount: 0,
      totalPointCount: null,
      sampleStride: 1,
      message: null,
    });

    try {
      const response = await this.runtime.fetch(input.downloadUrl, {
        signal: load.abort.signal,
      });
      if (!response.ok) {
        throw new Error(`Le stockage a répondu HTTP ${response.status}.`);
      }
      const blob = await response.blob();
      if (this.pointCloudLoads.get(input.assetId) !== load) return;

      this.updatePointCloudSnapshot(input.assetId, { phase: "streaming" });
      const stream = this.runtime.createPointCloudStream({
        blob,
        format,
        label: input.fileName,
        maxPointsInMemory: input.maxPointsInMemory,
        signal: load.abort.signal,
        onOpen: (info) => {
          if (this.pointCloudLoads.get(input.assetId) !== load) return;
          load.handle = this.renderer.beginPointCloudStream({
            expressId: load.expressId,
            ifcType: "IfcPointCloud",
          });
          this.renderer.setPointCloudTransform(
            load.handle,
            composePointCloudTransform(load.transform),
          );
          this.updatePointCloudSnapshot(input.assetId, {
            totalPointCount: info.totalPointCount,
            sampleStride: info.stride,
          });
        },
        onChunk: (chunk) => {
          if (
            this.pointCloudLoads.get(input.assetId) !== load ||
            !load.handle
          ) {
            return;
          }
          this.renderer.appendPointCloudChunk(load.handle, chunk);
          this.renderer.requestRender();
        },
        onProgress: (loaded, total) => {
          if (this.pointCloudLoads.get(input.assetId) !== load) return;
          this.updatePointCloudSnapshot(input.assetId, {
            pointCount: loaded,
            progress: total > 0 ? Math.min(1, loaded / total) : 0,
          });
        },
        onComplete: (_bounds, pointCount) => {
          if (this.pointCloudLoads.get(input.assetId) !== load) return;
          if (load.handle) this.renderer.endPointCloudStream(load.handle);
          this.updatePointCloudSnapshot(input.assetId, {
            phase: "ready",
            progress: 1,
            pointCount,
            message: null,
          });
          this.renderer.requestRender();
        },
        onError: (error) => {
          if (this.pointCloudLoads.get(input.assetId) !== load) return;
          if (load.handle) {
            this.renderer.removePointCloudAsset(load.handle);
            load.handle = null;
            this.renderer.requestRender();
          }
          this.updatePointCloudSnapshot(input.assetId, {
            phase: "error",
            message: error.message,
          });
        },
      });
      load.stream = stream;
      await stream.done;
    } catch (error) {
      if (this.pointCloudLoads.get(input.assetId) !== load) return;
      this.updatePointCloudSnapshot(input.assetId, {
        phase: "error",
        message: errorMessage(error),
      });
      throw error;
    }
  }

  removePointCloud(assetId: string) {
    const load = this.pointCloudLoads.get(assetId);
    if (!load) return;

    load.abort.abort();
    load.stream?.cancel();
    if (load.handle) this.renderer.removePointCloudAsset(load.handle);
    this.pointCloudLoads.delete(assetId);
    this.updateSnapshot({
      pointClouds: this.snapshot.pointClouds.filter(
        (pointCloud) => pointCloud.assetId !== assetId,
      ),
    });
    this.renderer.requestRender();
  }

  setPointCloudPointSize(pointSize: number) {
    const normalized = Math.min(12, Math.max(1, pointSize));
    this.renderer.setPointCloudOptions({ pointSize: normalized });
    this.updateSnapshot({
      pointCloudOptions: { pointSize: normalized },
    });
    this.renderer.requestRender();
  }

  setPointCloudTransform(assetId: string, transform: PointCloudTransform) {
    const load = this.pointCloudLoads.get(assetId);
    if (!load) return;

    load.transform = transform;
    if (load.handle) {
      this.renderer.setPointCloudTransform(
        load.handle,
        composePointCloudTransform(transform),
      );
      this.renderer.requestRender();
    }
  }

  fitToView() {
    if (
      !this.disposed &&
      (this.snapshot.meshCount > 0 ||
        this.snapshot.pointClouds.some((cloud) => cloud.pointCount > 0))
    ) {
      this.renderer.fitToView();
      this.renderer.requestRender();
    }
  }

  frameSelection() {
    const expressId = this.snapshot.selection?.expressId;
    if (this.disposed || expressId === undefined) return;

    const bounds = this.renderer.getScene().getEntityBoundingBox(expressId);
    if (!bounds) return;

    void this.renderer.getCamera().frameBounds(bounds.min, bounds.max);
    this.renderer.requestRender();
  }

  selectEntity(
    expressId: number | null,
    orbitCenter?: { x: number; y: number; z: number },
  ) {
    const generation = ++this.selectionGeneration;

    if (expressId === null) {
      this.renderer.getCamera().setOrbitCenter(null);
      this.updateSnapshot({
        selection: null,
        selectionPhase: "idle",
        selectionMessage: null,
      });
      this.renderer.requestRender();
      return;
    }

    const store = this.store;
    if (!store) return;

    this.updateSnapshot({
      selectionPhase: "loading",
      selectionMessage: null,
    });

    try {
      const selection = this.runtime.readElementDetails(store, expressId);
      if (generation !== this.selectionGeneration || this.disposed) return;

      if (!selection) {
        this.selectEntity(null);
        return;
      }

      const bounds = this.renderer.getScene().getEntityBoundingBox(expressId);
      const center =
        orbitCenter ??
        (bounds
          ? {
              x: (bounds.min.x + bounds.max.x) / 2,
              y: (bounds.min.y + bounds.max.y) / 2,
              z: (bounds.min.z + bounds.max.z) / 2,
            }
          : undefined);
      this.renderer.getCamera().setOrbitCenter(center ?? null);
      this.updateSnapshot({
        selection,
        selectionPhase: "ready",
        selectionMessage: null,
      });
      this.renderer.requestRender();
    } catch (error) {
      if (generation !== this.selectionGeneration || this.disposed) return;
      this.updateSnapshot({
        selection: null,
        selectionPhase: "error",
        selectionMessage: errorMessage(error),
      });
      this.renderer.requestRender();
    }
  }

  isolate(query: IfcBimQuery, label?: string) {
    const ids = this.findBimIds(query);
    const visual = this.snapshot.visual;
    this.applyVisualPlan({
      focusIds: ids,
      showContext: visual.showContext,
      contextOpacity: visual.contextOpacity,
      label: label ?? "Isolation BIM",
    });
  }

  hide(query: IfcBimQuery, label?: string) {
    const ids = this.findBimIds(query);
    this.applyVisualPlan({
      hiddenIds: ids,
      label: label ?? "Éléments masqués",
    });
    this.updateVisualSnapshot({ mode: "hide", matchCount: ids.length });
  }

  color(
    query: IfcBimQuery,
    color: readonly [number, number, number, number],
    label?: string,
  ) {
    const ids = this.findBimIds(query);
    this.applyVisualPlan({
      colors: [{ ids, color }],
      label: label ?? "Coloration BIM",
    });
    this.updateVisualSnapshot({ mode: "color", matchCount: ids.length });
  }

  colorByStorey() {
    const storeys = this.snapshot.catalog?.storeys ?? [];
    const palette = [
      [0.24, 0.62, 0.98, 1],
      [0.93, 0.32, 0.3, 1],
      [0.55, 0.36, 0.96, 1],
      [0.12, 0.72, 0.48, 1],
      [0.96, 0.65, 0.18, 1],
      [0.91, 0.3, 0.66, 1],
    ] as const;
    const groups = storeys.map((storey, index) => ({
      ids: this.findBimIds({ storeyId: storey.expressId }),
      color: palette[index % palette.length],
    }));
    this.applyVisualPlan({ colors: groups, label: "Palette par niveau" });
    this.updateVisualSnapshot({
      mode: "color",
      matchCount: groups.reduce((count, group) => count + group.ids.length, 0),
    });
  }

  setIsolationContext(showContext: boolean, contextOpacity: number) {
    const opacity = Math.min(0.9, Math.max(0.02, contextOpacity));
    const focusIds = this.ghostExceptIds ?? this.isolatedIds;
    this.updateVisualSnapshot({ showContext, contextOpacity: opacity });

    if (this.snapshot.visual.mode === "isolate" && focusIds) {
      this.isolatedIds = showContext ? null : new Set(focusIds);
      this.ghostExceptIds = showContext ? new Set(focusIds) : null;
      this.renderer.requestRender();
    }
  }

  applyVisualPlan(plan: IfcVisualPlan) {
    this.hiddenIds = new Set(plan.hiddenIds ?? []);
    const focusIds = plan.focusIds ? new Set(plan.focusIds) : null;
    const showContext = plan.showContext ?? this.snapshot.visual.showContext;
    const contextOpacity = Math.min(
      0.9,
      Math.max(
        0.02,
        plan.contextOpacity ?? this.snapshot.visual.contextOpacity,
      ),
    );
    this.isolatedIds = focusIds && !showContext ? focusIds : null;
    this.ghostExceptIds = focusIds && showContext ? focusIds : null;
    this.colorOverrides = new Map();

    for (const group of plan.colors ?? []) {
      const color = [...group.color] as [number, number, number, number];
      for (const expressId of group.ids) {
        this.colorOverrides.set(expressId, color);
      }
    }

    this.syncColorOverrides();
    this.updateSnapshot({
      visual: {
        mode: focusIds
          ? "isolate"
          : this.hiddenIds.size
            ? "hide"
            : this.colorOverrides.size
              ? "color"
              : "all",
        label: plan.label ?? null,
        matchCount:
          focusIds?.size ?? (this.hiddenIds.size || this.colorOverrides.size),
        showContext,
        contextOpacity,
      },
    });
    this.renderer.requestRender();
  }

  resetVisuals() {
    this.applyVisualPlan({ label: null });
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.loadGeneration += 1;
    this.selectionGeneration += 1;
    this.currentDownload?.abort();
    this.currentDownload = null;
    for (const load of this.pointCloudLoads.values()) {
      load.abort.abort();
      load.stream?.cancel();
    }
    this.pointCloudLoads.clear();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.detachInteractions();
    this.unsubscribeDeviceLoss?.();
    this.unsubscribeDeviceLoss = null;

    if (this.frameHandle !== null) {
      this.runtime.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }

    this.geometry.dispose();
    this.renderer.destroy();
    this.store = null;
    this.bimIndex = null;
    this.listeners.clear();
  }

  private async initialize() {
    this.updateSnapshot({ phase: "initializing", message: null });
    this.resizeCanvas();

    try {
      this.unsubscribeDeviceLoss = this.renderer.onDeviceLost((info) => {
        if (this.disposed) return;
        this.updateSnapshot({
          phase: "device_lost",
          message: info.message || "Le périphérique WebGPU a été perdu.",
        });
      });
      await Promise.all([this.renderer.init(), this.geometry.init()]);

      if (this.disposed) return;

      this.resizeObserver = this.runtime.createResizeObserver(() => {
        if (this.disposed) return;
        this.resizeCanvas();
        this.renderer.requestRender();
      });
      this.resizeObserver.observe(this.canvas);
      this.attachInteractions();
      this.startFrameLoop();
      this.updateSnapshot({ phase: "idle", message: null });
      this.renderer.requestRender();
    } catch (error) {
      if (!this.disposed) {
        this.updateSnapshot({ phase: "error", message: errorMessage(error) });
      }
      throw error;
    }
  }

  private async runIfcLoad(input: LoadIfcInput, generation: number) {
    await this.init();
    if (!this.isCurrentLoad(generation)) return;

    this.currentDownload = new AbortController();
    this.store = null;
    this.bimIndex = null;
    this.hiddenIds = new Set();
    this.isolatedIds = null;
    this.ghostExceptIds = null;
    this.colorOverrides = new Map();
    this.selectionGeneration += 1;
    this.renderer.getCamera().setOrbitCenter(null);
    this.renderer.getScene().clear();
    this.renderer.requestRender();
    this.snapshot = {
      ...defaultSnapshot,
      pointClouds: this.snapshot.pointClouds,
      pointCloudOptions: this.snapshot.pointCloudOptions,
    };
    this.updateSnapshot({ phase: "downloading" });

    try {
      const response = await this.runtime.fetch(input.downloadUrl, {
        signal: this.currentDownload.signal,
      });

      if (!response.ok) {
        throw new Error(`Le stockage a répondu HTTP ${response.status}.`);
      }

      const source = await response.arrayBuffer();
      if (!this.isCurrentLoad(generation)) return;

      this.updateSnapshot({ phase: "processing" });
      const parserOptions: ParseOptions = {
        onProgress: ({ percent }) => {
          if (this.isCurrentLoad(generation)) {
            this.updateSnapshot({ parserPercent: Math.round(percent) });
          }
        },
      };
      const parse = this.parser.parseColumnar(source, parserOptions);
      const processing = input.processing ?? { engine: "browser" };
      this.updateSnapshot({
        processing: {
          engine: processing.engine,
          cacheKey: null,
          cacheHit: null,
        },
      });
      const geometry =
        processing.engine === "rust"
          ? this.streamServerGeometry(
              source.slice(0),
              processing.serverBaseUrl,
              generation,
            )
          : this.streamBrowserGeometry(
              new Uint8Array(source.slice(0)),
              generation,
            );
      const [store] = await Promise.all([parse, geometry]);

      if (!this.isCurrentLoad(generation)) return;

      this.store = store;
      this.bimIndex = this.runtime.createBimIndex(
        store,
        this.renderer.getScene().getAllMeshDataExpressIds(),
      );
      this.renderer.fitToView();
      this.renderer.requestRender();
      this.updateSnapshot({
        phase: "ready",
        parserPercent: 100,
        entityCount: store.entityCount,
        catalog: this.bimIndex.catalog,
        message: null,
      });
    } catch (error) {
      if (!this.isCurrentLoad(generation)) return;

      this.updateSnapshot({ phase: "error", message: errorMessage(error) });
      throw error;
    } finally {
      if (this.isCurrentLoad(generation)) {
        this.currentDownload = null;
      }
    }
  }

  private async streamBrowserGeometry(source: Uint8Array, generation: number) {
    for await (const event of this.geometry.processAdaptive(source)) {
      if (!this.isCurrentLoad(generation)) return;
      this.applyGeometryEvent(event);
    }
  }

  private async streamServerGeometry(
    source: ArrayBuffer,
    serverBaseUrl: string,
    generation: number,
  ) {
    const client = this.runtime.createServerClient(serverBaseUrl);
    let meshCount = 0;
    const result = await client.parseParquetStream(source, (batch) => {
      if (!this.isCurrentLoad(generation)) return;

      const meshes = toBrowserMeshBatch(batch.meshes);
      if (!meshes.length) return;

      meshCount += meshes.length;
      this.renderer.addMeshes(meshes, true);
      this.renderer.requestRender();
      this.updateSnapshot({ meshCount });
    });

    if (!this.isCurrentLoad(generation)) return;

    this.updateSnapshot({
      processing: {
        engine: "rust",
        cacheKey: result.cache_key,
        cacheHit: result.stats.from_cache,
      },
    });
  }

  private applyGeometryEvent(event: StreamingGeometryEvent) {
    if (event.type === "batch") {
      this.renderer.addMeshes(event.meshes, true);
      this.renderer.requestRender();
      this.updateSnapshot({ meshCount: event.totalSoFar });
    } else if (event.type === "complete") {
      this.updateSnapshot({ meshCount: event.totalMeshes });
    }
  }

  private startFrameLoop() {
    const frame = (time: number) => {
      if (this.disposed) return;

      const delta = this.lastFrameTime === null ? 0 : time - this.lastFrameTime;
      this.lastFrameTime = time;
      const scene = this.renderer.getScene();
      let queueFlushed = false;

      if (scene.hasQueuedMeshes()) {
        const device = this.renderer.getGPUDevice();
        const pipeline = this.renderer.getPipeline();
        if (device && pipeline) {
          queueFlushed = scene.flushPending(device, pipeline);
        }
      }

      const cameraAnimating = this.renderer.getCamera().update(delta);
      if (
        queueFlushed ||
        cameraAnimating ||
        this.renderer.peekRenderRequest()
      ) {
        this.renderer.consumeRenderRequest();
        this.renderer.render({
          isInteracting: this.pointerMode !== null,
          selectedId: this.snapshot.selection?.expressId ?? null,
          hiddenIds: this.hiddenIds,
          isolatedIds: this.isolatedIds,
          ghostExceptIds: this.ghostExceptIds,
          ghostAlpha: this.snapshot.visual.contextOpacity,
        });
      }

      this.frameHandle = this.runtime.requestFrame(frame);
    };

    this.frameHandle = this.runtime.requestFrame(frame);
  }

  private resizeCanvas() {
    const bounds = this.canvas.getBoundingClientRect();
    this.renderer.resize(
      alignCanvasWidth(bounds.width),
      clampCanvasHeight(bounds.height),
    );
  }

  private attachInteractions() {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  private detachInteractions() {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;

    this.pointerId = event.pointerId;
    this.pointerMode =
      event.button === 1 || event.button === 2 || event.shiftKey
        ? "pan"
        : "orbit";
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.pointerMoved = false;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.pointerMode || event.pointerId !== this.pointerId) return;

    const deltaX = event.clientX - this.pointerX;
    const deltaY = event.clientY - this.pointerY;
    if (
      Math.abs(event.clientX - this.pointerStartX) +
        Math.abs(event.clientY - this.pointerStartY) >
      4
    ) {
      this.pointerMoved = true;
    }
    const camera = this.renderer.getCamera();

    if (this.pointerMode === "pan") {
      camera.pan(deltaX, deltaY, false);
    } else {
      camera.orbit(deltaX, deltaY, false);
    }

    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.renderer.requestRender();
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;

    const shouldPick =
      event.type !== "pointercancel" &&
      event.button === 0 &&
      this.pointerMode === "orbit" &&
      !this.pointerMoved;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.pointerId = null;
    this.pointerMode = null;
    this.canvas.style.cursor = "grab";
    this.renderer.requestRender();

    if (shouldPick) {
      const bounds = this.canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const loadGeneration = this.loadGeneration;
      void this.renderer
        .pick(x, y, {
          hiddenIds: this.hiddenIds,
          isolatedIds: this.isolatedIds,
        })
        .then((hit) => {
          if (!this.isCurrentLoad(loadGeneration)) return;
          this.selectEntity(
            hit && hit.expressId > 0 ? hit.expressId : null,
            hit?.worldXYZ,
          );
        })
        .catch(() => undefined);
    }
  };

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const bounds = this.canvas.getBoundingClientRect();
    this.renderer
      .getCamera()
      .zoom(
        event.deltaY,
        false,
        event.clientX - bounds.left,
        event.clientY - bounds.top,
        this.canvas.width,
        this.canvas.height,
        event.shiftKey,
      );
    this.renderer.requestRender();
  };

  private readonly onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  private isCurrentLoad(generation: number) {
    return !this.disposed && generation === this.loadGeneration;
  }

  private syncColorOverrides() {
    const scene = this.renderer.getScene();
    if (this.colorOverrides.size === 0) {
      scene.clearColorOverrides();
      return;
    }

    const device = this.renderer.getGPUDevice();
    const pipeline = this.renderer.getPipeline();
    if (device && pipeline) {
      scene.setColorOverrides(this.colorOverrides, device, pipeline);
    }
  }

  private updateVisualSnapshot(update: Partial<IfcVisualSnapshot>) {
    this.updateSnapshot({
      visual: { ...this.snapshot.visual, ...update },
    });
    this.renderer.requestRender();
  }

  private updatePointCloudSnapshot(
    assetId: string,
    update: Partial<PointCloudSnapshot> & Pick<PointCloudSnapshot, "assetId">,
  ): void;
  private updatePointCloudSnapshot(
    assetId: string,
    update: Partial<PointCloudSnapshot>,
  ): void;
  private updatePointCloudSnapshot(
    assetId: string,
    update: Partial<PointCloudSnapshot>,
  ) {
    const existing = this.snapshot.pointClouds.find(
      (pointCloud) => pointCloud.assetId === assetId,
    );
    if (!existing && !update.assetId) return;

    const next = existing
      ? { ...existing, ...update }
      : (update as PointCloudSnapshot);
    this.updateSnapshot({
      pointClouds: [
        ...this.snapshot.pointClouds.filter(
          (pointCloud) => pointCloud.assetId !== assetId,
        ),
        next,
      ],
    });
  }

  private updateSnapshot(update: Partial<IfcViewerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}
