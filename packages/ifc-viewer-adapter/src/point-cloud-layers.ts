import type { PointCloudAssetHandle, Renderer } from "@ifc-lite/renderer";
import {
  composePointCloudTransform,
  detectPointCloudFormat,
  type PointCloudFormat,
  type PointCloudLodView,
  type PointCloudOctreeStreamHandle,
  type PointCloudOctreeStreamOptions,
  type PointCloudStreamHandle,
  type PointCloudTransform,
} from "@mnemo/point-cloud-viewer-adapter";

import type {
  IfcViewerRuntime,
  LoadPointCloudInput,
  PointCloudSnapshot,
} from "./viewer-types";

type PreviewInput = Extract<
  LoadPointCloudInput,
  { source: { mode: "preview" } }
>;
type OctreeInput = Exclude<LoadPointCloudInput, { source: { mode: "preview" } }>;

function isPreviewInput(input: LoadPointCloudInput): input is PreviewInput {
  return input.source.mode === "preview";
}

type PointCloudLoad = {
  abort: AbortController;
  expressId: number;
  handles: Map<string, PointCloudAssetHandle>;
  stream: PointCloudStreamHandle | null;
  octree: PointCloudOctreeStreamHandle | null;
  transform: PointCloudTransform;
  pointBudget: number;
  lastLodSignature: string | null;
};

type PointCloudLayerHost = {
  renderer: Renderer;
  canvas: HTMLCanvasElement;
  runtime: Pick<
    IfcViewerRuntime,
    "fetch" | "createPointCloudStream" | "createPointCloudOctreeStream" | "createPointCloudCopcStream"
  >;
  initialize: () => Promise<void>;
  isDisposed: () => boolean;
  onSnapshot: (assetId: string, update: Partial<PointCloudSnapshot>) => void;
  onRemove: (assetId: string) => void;
};

/** Owns point-cloud GPU handles and streams; the viewer owns only the scene. */
export class PointCloudLayers {
  private readonly loads = new Map<string, PointCloudLoad>();
  private readonly requests = new Map<string, number>();
  private nextExpressId = 0xf0000000;

  constructor(private readonly host: PointCloudLayerHost) {}

  async load(input: LoadPointCloudInput) {
    const request = this.nextRequest(input.assetId);
    await this.host.initialize();
    if (this.host.isDisposed() || this.requests.get(input.assetId) !== request)
      return;

    const format = detectPointCloudFormat(input.fileName);
    if (!format) {
      throw new Error(
        `Format de nuage de points non pris en charge : ${input.fileName}`,
      );
    }

    this.discard(input.assetId);
    const load: PointCloudLoad = {
      abort: new AbortController(),
      expressId: this.nextExpressId--,
      handles: new Map(),
      stream: null,
      octree: null,
      transform: input.transform,
      pointBudget: input.maxPointsInMemory,
      lastLodSignature: null,
    };
    this.loads.set(input.assetId, load);
    this.host.onSnapshot(input.assetId, {
      assetId: input.assetId,
      fileName: input.fileName,
      format,
      phase: "downloading",
      progress: 0,
      pointCount: 0,
      totalPointCount: null,
      sampleStride: 1,
      source: input.source.mode,
      residentNodeCount: 0,
      message: null,
    });

    try {
      if (isPreviewInput(input)) {
        await this.loadPreview(input, load, format);
      } else {
        await this.loadOctree(input, load);
      }
    } catch (error) {
      if (this.loads.get(input.assetId) !== load) return;
      this.host.onSnapshot(input.assetId, {
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async loadPreview(
    input: PreviewInput,
    load: PointCloudLoad,
    format: PointCloudFormat,
  ) {
    const response = await this.host.runtime.fetch(input.source.downloadUrl, {
      signal: load.abort.signal,
    });
    if (!response.ok) {
      throw new Error(`Le stockage a répondu HTTP ${response.status}.`);
    }
    const blob = await response.blob();
    if (this.loads.get(input.assetId) !== load) return;

    this.host.onSnapshot(input.assetId, { phase: "streaming" });
    const stream = this.host.runtime.createPointCloudStream({
      blob,
      format,
      label: input.fileName,
      maxPointsInMemory: input.maxPointsInMemory,
      signal: load.abort.signal,
      onOpen: (info) => {
        if (this.loads.get(input.assetId) !== load) return;
        const handle = this.host.renderer.beginPointCloudStream({
          expressId: load.expressId,
          ifcType: "IfcPointCloud",
        });
        load.handles.set("preview", handle);
        this.host.renderer.setPointCloudTransform(
          handle,
          composePointCloudTransform(load.transform),
        );
        this.host.onSnapshot(input.assetId, {
          totalPointCount: info.totalPointCount,
          sampleStride: info.stride,
          residentNodeCount: 1,
        });
      },
      onChunk: (chunk) => {
        const handle = load.handles.get("preview");
        if (this.loads.get(input.assetId) !== load || !handle) return;
        this.host.renderer.appendPointCloudChunk(handle, chunk);
        this.host.renderer.requestRender();
      },
      onProgress: (loaded, total) => {
        if (this.loads.get(input.assetId) !== load) return;
        this.host.onSnapshot(input.assetId, {
          pointCount: loaded,
          progress: total > 0 ? Math.min(1, loaded / total) : 0,
        });
      },
      onComplete: (_bounds, pointCount) => {
        if (this.loads.get(input.assetId) !== load) return;
        const handle = load.handles.get("preview");
        if (handle) this.host.renderer.endPointCloudStream(handle);
        this.host.onSnapshot(input.assetId, {
          phase: "ready",
          progress: 1,
          pointCount,
          message: null,
        });
        this.host.renderer.requestRender();
      },
      onError: (error) => {
        if (this.loads.get(input.assetId) !== load) return;
        this.clearHandles(load);
        this.host.onSnapshot(input.assetId, {
          phase: "error",
          message: error.message,
        });
      },
    });
    load.stream = stream;
    await stream.done;
  }

  private async loadOctree(input: OctreeInput, load: PointCloudLoad) {
    this.host.onSnapshot(input.assetId, { phase: "streaming" });
    const common: Pick<PointCloudOctreeStreamOptions, "signal" | "onOpen" | "onSwap" | "onError"> = {
      signal: load.abort.signal,
      onOpen: (info) => {
        if (this.loads.get(input.assetId) !== load) return;
        this.host.onSnapshot(input.assetId, {
          totalPointCount: info.totalPointCount,
        });
      },
      onSwap: ({ add, remove, pointCount, nodeCount, complete }) => {
        if (this.loads.get(input.assetId) !== load) return;
        const transform = composePointCloudTransform(load.transform);

        // Apply the complete resident-set swap before requesting a frame.
        for (const { nodeId, chunk } of add) {
          if (load.handles.has(nodeId)) continue;
          const handle = this.host.renderer.beginPointCloudStream({
            expressId: load.expressId,
            ifcType: "IfcPointCloud",
          });
          this.host.renderer.setPointCloudTransform(handle, transform);
          this.host.renderer.appendPointCloudChunk(handle, chunk);
          this.host.renderer.endPointCloudStream(handle);
          load.handles.set(nodeId, handle);
        }
        for (const nodeId of remove) {
          const handle = load.handles.get(nodeId);
          if (!handle) continue;
          this.host.renderer.removePointCloudAsset(handle);
          load.handles.delete(nodeId);
        }
        this.host.onSnapshot(input.assetId, {
          phase: complete ? "ready" : "streaming",
          progress: complete
            ? 1
            : Math.min(0.99, pointCount / Math.max(1, load.pointBudget)),
          pointCount,
          residentNodeCount: nodeCount,
          message: null,
        });
        if (add.length || remove.length) this.host.renderer.requestRender();
      },
      onError: (error) => {
        if (this.loads.get(input.assetId) !== load) return;
        this.clearHandles(load);
        this.host.onSnapshot(input.assetId, {
          phase: "error",
          message: error.message,
        });
      },
    };
    const stream = input.source.mode === "copc"
      ? this.host.runtime.createPointCloudCopcStream({
          ...common,
          access: input.source.access,
          refreshAccess: input.source.refreshAccess,
        })
      : this.host.runtime.createPointCloudOctreeStream({
          ...common,
          access: input.source.access,
          refreshAccess: input.source.refreshAccess,
        });
    load.octree = stream;
    load.lastLodSignature = null;
    this.updateLod();
    await stream.ready;
  }

  private clearHandles(load: PointCloudLoad) {
    for (const handle of load.handles.values()) {
      this.host.renderer.removePointCloudAsset(handle);
    }
    load.handles.clear();
    this.host.renderer.requestRender();
  }

  private nextRequest(assetId: string) {
    const request = (this.requests.get(assetId) ?? 0) + 1;
    this.requests.set(assetId, request);
    return request;
  }

  remove(assetId: string) {
    this.nextRequest(assetId);
    this.discard(assetId);
  }

  private discard(assetId: string) {
    const load = this.loads.get(assetId);
    if (!load) return;

    load.abort.abort();
    load.stream?.cancel();
    load.octree?.cancel();
    for (const handle of load.handles.values()) {
      this.host.renderer.removePointCloudAsset(handle);
    }
    this.loads.delete(assetId);
    this.host.onRemove(assetId);
    this.host.renderer.requestRender();
  }

  setBudget(pointBudget: number) {
    const normalized = Math.max(10_000, Math.floor(pointBudget));
    for (const load of this.loads.values()) {
      load.pointBudget = normalized;
      load.lastLodSignature = null;
    }
    this.updateLod();
  }

  setTransform(assetId: string, transform: PointCloudTransform) {
    const load = this.loads.get(assetId);
    if (!load) return;

    load.transform = transform;
    for (const handle of load.handles.values()) {
      this.host.renderer.setPointCloudTransform(
        handle,
        composePointCloudTransform(transform),
      );
    }
    load.lastLodSignature = null;
    this.updateLod();
    this.host.renderer.requestRender();
  }

  updateLod() {
    const camera = this.host.renderer.getCamera();
    const viewProjectionMatrix = new Float32Array(camera.getViewProjMatrix().m);
    const position = camera.getPosition();
    const projectionMode = camera.getProjectionMode();
    const baseSignature = [
      this.host.canvas.width,
      this.host.canvas.height,
      projectionMode,
      camera.getFOV(),
      camera.getOrthoSize(),
      position.x,
      position.y,
      position.z,
      ...viewProjectionMatrix,
    ]
      .map((value) =>
        typeof value === "number" ? Math.round(value * 100_000) : value,
      )
      .join(":");

    for (const load of this.loads.values()) {
      if (!load.octree) continue;
      const modelMatrix = composePointCloudTransform(load.transform);
      const signature = `${baseSignature}:${load.pointBudget}:${[...modelMatrix]
        .map((value) => Math.round(value * 100_000))
        .join(":")}`;
      if (signature === load.lastLodSignature) continue;
      load.lastLodSignature = signature;
      const view: PointCloudLodView = {
        viewProjectionMatrix,
        modelMatrix,
        cameraPosition: [position.x, position.y, position.z],
        verticalFovRadians: camera.getFOV(),
        viewportHeight: Math.max(1, this.host.canvas.height),
        pointBudget: load.pointBudget,
        ...(projectionMode === "orthographic"
          ? { orthographicHeight: camera.getOrthoSize() }
          : {}),
      };
      load.octree.update(view);
    }
  }

  dispose() {
    for (const load of this.loads.values()) {
      load.abort.abort();
      load.stream?.cancel();
      load.octree?.cancel();
    }
    this.loads.clear();
    this.requests.clear();
  }
}
