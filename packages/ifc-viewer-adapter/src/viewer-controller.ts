import {
  GeometryProcessor,
  type StreamingGeometryEvent,
} from "@ifc-lite/geometry";
import {
  IfcParser,
  type IfcDataStore,
  type ParseOptions,
} from "@ifc-lite/parser";
import { Renderer } from "@ifc-lite/renderer";

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
};

export type LoadIfcInput = {
  downloadUrl: string;
};

type FrameRequest = (callback: FrameRequestCallback) => number;
type FrameCancel = (handle: number) => void;

export type IfcViewerRuntime = {
  createRenderer: (canvas: HTMLCanvasElement) => Renderer;
  createGeometryProcessor: () => GeometryProcessor;
  createParser: () => IfcParser;
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
};

function createDefaultRuntime(): IfcViewerRuntime {
  return {
    createRenderer: (canvas) => new Renderer(canvas),
    createGeometryProcessor: () => new GeometryProcessor(),
    createParser: () => new IfcParser(),
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
  private pointerX = 0;
  private pointerY = 0;

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

  fitToView() {
    if (!this.disposed && this.snapshot.meshCount > 0) {
      this.renderer.fitToView();
      this.renderer.requestRender();
    }
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.loadGeneration += 1;
    this.currentDownload?.abort();
    this.currentDownload = null;
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
    this.renderer.getScene().clear();
    this.renderer.requestRender();
    this.snapshot = defaultSnapshot;
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
      const geometry = this.streamGeometry(
        new Uint8Array(source.slice(0)),
        generation,
      );
      const [store] = await Promise.all([parse, geometry]);

      if (!this.isCurrentLoad(generation)) return;

      this.store = store;
      this.renderer.fitToView();
      this.renderer.requestRender();
      this.updateSnapshot({
        phase: "ready",
        parserPercent: 100,
        entityCount: store.entityCount,
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

  private async streamGeometry(source: Uint8Array, generation: number) {
    for await (const event of this.geometry.processAdaptive(source)) {
      if (!this.isCurrentLoad(generation)) return;
      this.applyGeometryEvent(event);
    }
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
        this.renderer.render({ isInteracting: this.pointerMode !== null });
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
    this.pointerMode =
      event.button === 1 || event.button === 2 || event.shiftKey
        ? "pan"
        : "orbit";
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.pointerMode) return;

    const deltaX = event.clientX - this.pointerX;
    const deltaY = event.clientY - this.pointerY;
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
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.pointerMode = null;
    this.canvas.style.cursor = "grab";
    this.renderer.requestRender();
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

  private updateSnapshot(update: Partial<IfcViewerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}
