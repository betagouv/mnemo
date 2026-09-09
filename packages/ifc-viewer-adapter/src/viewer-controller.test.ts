import type {
  GeometryProcessor,
  MeshData,
  StreamingGeometryEvent,
} from "@ifc-lite/geometry";
import type { IfcDataStore, IfcParser } from "@ifc-lite/parser";
import type { Renderer } from "@ifc-lite/renderer";
import type {
  MeshData as ServerMeshData,
  ParquetStreamResult,
} from "@ifc-lite/server-client";
import { describe, expect, it } from "vitest";

import {
  IfcViewerController,
  type IfcViewerRuntime,
} from "./viewer-controller";

function createHarness() {
  const calls = {
    rendererCreated: 0,
    rendererInitialized: 0,
    geometryInitialized: 0,
    serverClientCreated: 0,
    sceneCleared: 0,
    colorOverridesSet: 0,
    colorOverridesCleared: 0,
    batchesAdded: 0,
    fitToView: 0,
    orbit: 0,
    pan: 0,
    zoom: 0,
    pick: 0,
    orbitCenter: null as { x: number; y: number; z: number } | null,
    rendererDestroyed: 0,
    geometryDisposed: 0,
    pointCloudsBegun: 0,
    pointCloudChunks: 0,
    pointCloudTransforms: 0,
    pointCloudOptions: 0,
    pointCloudsRemoved: 0,
    cameraPosesApplied: 0,
  };
  let renderRequested = false;
  let cameraPosition = { x: 12, y: 8, z: 20 };
  let cameraTarget = { x: 2, y: 3, z: 4 };
  let cameraUp = { x: 0, y: 1, z: 0 };
  let projection: "perspective" | "orthographic" = "perspective";
  const camera = {
    update: () => false,
    orbit: () => {
      calls.orbit += 1;
    },
    pan: () => {
      calls.pan += 1;
    },
    zoom: () => {
      calls.zoom += 1;
    },
    setOrbitCenter: (center: { x: number; y: number; z: number } | null) => {
      calls.orbitCenter = center;
    },
    getPosition: () => cameraPosition,
    getTarget: () => cameraTarget,
    getUp: () => cameraUp,
    getFOV: () => Math.PI / 3,
    getAspect: () => 16 / 9,
    getDistance: () => 20,
    getProjectionMode: () => projection,
    getOrthoSize: () => 10,
    stopInertia: () => undefined,
    setProjectionMode: (value: "perspective" | "orthographic") => {
      projection = value;
      calls.cameraPosesApplied += 1;
    },
    setPosition: (x: number, y: number, z: number) => {
      cameraPosition = { x, y, z };
      calls.cameraPosesApplied += 1;
    },
    setTarget: (x: number, y: number, z: number) => {
      cameraTarget = { x, y, z };
      calls.cameraPosesApplied += 1;
    },
    setUp: (x: number, y: number, z: number) => {
      cameraUp = { x, y, z };
      calls.cameraPosesApplied += 1;
    },
    setFOV: () => {
      calls.cameraPosesApplied += 1;
    },
    setOrthoSize: () => {
      calls.cameraPosesApplied += 1;
    },
  };
  const scene = {
    clear: () => {
      calls.sceneCleared += 1;
    },
    hasQueuedMeshes: () => false,
    flushPending: () => false,
    getEntityBoundingBox: () => ({
      min: { x: 0, y: 2, z: 4 },
      max: { x: 2, y: 4, z: 6 },
    }),
    getAllMeshDataExpressIds: () => [42, 84],
    setColorOverrides: () => {
      calls.colorOverridesSet += 1;
    },
    clearColorOverrides: () => {
      calls.colorOverridesCleared += 1;
    },
  };
  const renderer = {
    init: async () => {
      calls.rendererInitialized += 1;
    },
    onDeviceLost: () => () => undefined,
    resize: () => undefined,
    getScene: () => scene,
    getCamera: () => camera,
    getGPUDevice: () => ({}),
    getPipeline: () => ({}),
    addMeshes: () => {
      calls.batchesAdded += 1;
    },
    fitToView: () => {
      calls.fitToView += 1;
    },
    requestRender: () => {
      renderRequested = true;
    },
    peekRenderRequest: () => renderRequested,
    consumeRenderRequest: () => {
      const requested = renderRequested;
      renderRequested = false;
      return requested;
    },
    render: () => undefined,
    pick: async () => {
      calls.pick += 1;
      return {
        expressId: 42,
        worldXYZ: { x: 1, y: 3, z: 5 },
      };
    },
    beginPointCloudStream: () => {
      calls.pointCloudsBegun += 1;
      return { id: calls.pointCloudsBegun };
    },
    appendPointCloudChunk: () => {
      calls.pointCloudChunks += 1;
    },
    endPointCloudStream: () => undefined,
    removePointCloudAsset: () => {
      calls.pointCloudsRemoved += 1;
    },
    setPointCloudTransform: () => {
      calls.pointCloudTransforms += 1;
    },
    setPointCloudOptions: () => {
      calls.pointCloudOptions += 1;
    },
    captureScreenshot: async () => "data:image/png;base64,iVBORw0KGgo=",
    destroy: () => {
      calls.rendererDestroyed += 1;
    },
  } as unknown as Renderer;
  const geometry = {
    init: async () => {
      calls.geometryInitialized += 1;
    },
    async *processAdaptive(): AsyncGenerator<StreamingGeometryEvent> {
      yield {
        type: "batch",
        meshes: [{} as MeshData],
        totalSoFar: 1,
      };
      yield {
        type: "complete",
        totalMeshes: 1,
        coordinateInfo: {},
      } as StreamingGeometryEvent;
    },
    dispose: () => {
      calls.geometryDisposed += 1;
    },
  } as unknown as GeometryProcessor;
  const parser = {
    parseColumnar: async () => ({ entityCount: 3 }) as unknown as IfcDataStore,
  } as unknown as IfcParser;
  const canvasListeners = new Map<string, (event: Event) => void>();
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (typeof listener === "function") {
        canvasListeners.set(type, listener);
      }
    },
    removeEventListener: (type: string) => {
      canvasListeners.delete(type);
    },
    getBoundingClientRect: () => ({
      width: 1_000,
      height: 700,
      left: 0,
      top: 0,
    }),
    setPointerCapture: () => undefined,
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
  } as unknown as HTMLCanvasElement;
  const runtime: IfcViewerRuntime = {
    createRenderer: () => {
      calls.rendererCreated += 1;
      return renderer;
    },
    createGeometryProcessor: () => geometry,
    createParser: () => parser,
    createServerClient: () => {
      calls.serverClientCreated += 1;
      return {
        async parseParquetStream(_source, onBatch) {
          onBatch({
            batch_number: 0,
            decode_time_ms: 1,
            meshes: [
              {
                express_id: 42,
                ifc_type: "IfcWall",
                positions: new Float32Array([0, 0, 0]),
                normals: new Float32Array([0, 1, 0]),
                indices: new Uint32Array([0]),
                color: [0.4, 0.5, 0.6, 1],
              } satisfies ServerMeshData,
            ],
          });

          return {
            cache_key: "sha256-model-medium",
            total_meshes: 1,
            stats: { from_cache: true },
            metadata: {},
          } as unknown as ParquetStreamResult;
        },
      };
    },
    createBimIndex: () => ({
      catalog: {
        types: [
          { ifcClass: "IfcDoor", elementCount: 1 },
          { ifcClass: "IfcWall", elementCount: 1 },
        ],
        storeys: [
          {
            expressId: 10,
            name: "Niveau 1",
            elevation: 0,
            elementCount: 2,
          },
        ],
      },
      findIds: (query) =>
        query.ifcClass === "IfcDoor"
          ? [84]
          : query.ifcClass === "IfcWall"
            ? [42]
            : [42, 84],
      query: () => [
        {
          expressId: 42,
          globalId: "3vB1mExampleGlobalId",
          ifcClass: "IfcWall",
          name: "Mur test",
          storeyId: 10,
        },
        {
          expressId: 84,
          globalId: "0YvctA6Hn0pgmBdv0cPwH6",
          ifcClass: "IfcDoor",
          name: "Porte test",
          storeyId: 10,
        },
      ],
    }),
    createPointCloudStream: (options) => {
      options.onOpen?.({
        totalPointCount: 2,
        bbox: { min: [0, 0, 0], max: [1, 1, 1] },
        hasColor: true,
        hasClassification: false,
        hasIntensity: false,
        stride: 1,
      });
      options.onChunk({
        positions: new Float32Array([0, 0, 0, 1, 1, 1]),
        colors: new Float32Array([1, 0, 0, 0, 1, 0]),
        pointCount: 2,
        bbox: { min: [0, 0, 0], max: [1, 1, 1] },
      });
      options.onProgress?.(2, 2);
      options.onComplete?.({ min: [0, 0, 0], max: [1, 1, 1] }, 2, null);
      return { cancel: () => undefined, done: Promise.resolve() };
    },
    readElementDetails: (_store, expressId) => ({
      expressId,
      globalId: "3vB1mExampleGlobalId",
      ifcClass: "IfcWall",
      name: "Mur test",
      description: "",
      objectType: "",
      tag: "W-42",
      propertySets: [
        {
          name: "Pset_WallCommon",
          values: [
            {
              name: "IsExternal",
              type: 3,
              value: true,
            },
          ],
        },
      ],
      quantitySets: [],
    }),
    fetch: async () => new Response(Uint8Array.of(1, 2, 3)),
    requestFrame: () => 1,
    cancelFrame: () => undefined,
    createResizeObserver: () => ({
      observe: () => undefined,
      disconnect: () => undefined,
    }),
  };

  return {
    calls,
    controller: new IfcViewerController(canvas, runtime),
    dispatch(type: string, event: object) {
      canvasListeners.get(type)?.(event as Event);
    },
  };
}

describe("IfcViewerController", () => {
  it("initializes one renderer and one geometry processor", async () => {
    const { calls, controller } = createHarness();

    await Promise.all([controller.init(), controller.init()]);

    expect(calls.rendererCreated).toBe(1);
    expect(calls.rendererInitialized).toBe(1);
    expect(calls.geometryInitialized).toBe(1);
    controller.dispose();
  });

  it("streams geometry and frames exactly once for each explicit load", async () => {
    const { calls, controller } = createHarness();
    const phases: string[] = [];
    controller.subscribe((snapshot) => phases.push(snapshot.phase));

    await controller.loadIfc({ downloadUrl: "http://storage.local/model.ifc" });

    expect(controller.getSnapshot()).toMatchObject({
      phase: "ready",
      meshCount: 1,
      entityCount: 3,
    });
    expect(calls.batchesAdded).toBe(1);
    expect(calls.fitToView).toBe(1);
    expect(phases).toContain("processing");

    await controller.loadIfc({
      downloadUrl: "http://storage.local/model-2.ifc",
    });

    expect(calls.rendererCreated).toBe(1);
    expect(calls.sceneCleared).toBe(2);
    expect(calls.fitToView).toBe(2);
    controller.dispose();
  });

  it("streams Parquet geometry through the Rust server without replacing the renderer", async () => {
    const { calls, controller } = createHarness();

    await controller.loadIfc({
      downloadUrl: "http://storage.local/large-model.ifc",
      processing: {
        engine: "rust",
        serverBaseUrl: "http://ifc-server.local",
      },
    });

    expect(controller.getSnapshot()).toMatchObject({
      phase: "ready",
      meshCount: 1,
      processing: {
        engine: "rust",
        cacheKey: "sha256-model-medium",
        cacheHit: true,
      },
    });
    expect(calls.serverClientCreated).toBe(1);
    expect(calls.batchesAdded).toBe(1);
    expect(calls.rendererCreated).toBe(1);
    expect(calls.fitToView).toBe(1);
    controller.dispose();
  });

  it("releases GPU and WASM resources once", async () => {
    const { calls, controller } = createHarness();
    await controller.init();

    controller.dispose();
    controller.dispose();

    expect(calls.rendererDestroyed).toBe(1);
    expect(calls.geometryDisposed).toBe(1);
  });

  it("moves the camera without reframing or recreating the renderer", async () => {
    const { calls, controller, dispatch } = createHarness();
    await controller.init();

    dispatch("pointerdown", {
      button: 0,
      shiftKey: false,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    dispatch("pointermove", {
      clientX: 130,
      clientY: 115,
      pointerId: 1,
    });
    dispatch("pointerup", { button: 0, pointerId: 1, type: "pointerup" });
    dispatch("wheel", {
      clientX: 500,
      clientY: 350,
      deltaY: 120,
      shiftKey: false,
      preventDefault: () => undefined,
    });

    expect(calls.orbit).toBe(1);
    expect(calls.zoom).toBe(1);
    expect(calls.fitToView).toBe(0);
    expect(calls.rendererCreated).toBe(1);
    controller.dispose();
  });

  it("selects IFC semantics and uses the clicked surface as orbit center", async () => {
    const { calls, controller, dispatch } = createHarness();
    await controller.loadIfc({ downloadUrl: "http://storage.local/model.ifc" });

    dispatch("pointerdown", {
      type: "pointerdown",
      button: 0,
      shiftKey: false,
      clientX: 100,
      clientY: 120,
      pointerId: 7,
    });
    dispatch("pointerup", {
      type: "pointerup",
      button: 0,
      clientX: 100,
      clientY: 120,
      pointerId: 7,
    });
    await Promise.resolve();

    expect(calls.pick).toBe(1);
    expect(calls.orbitCenter).toEqual({ x: 1, y: 3, z: 5 });
    expect(controller.getSnapshot().selection).toMatchObject({
      expressId: 42,
      globalId: "3vB1mExampleGlobalId",
      ifcClass: "IfcWall",
      name: "Mur test",
    });
    expect(controller.getSnapshot().selection?.propertySets).toHaveLength(1);
    expect(calls.fitToView).toBe(1);
    controller.dispose();
  });

  it("applies BIM filters without rebuilding or reframing the scene", async () => {
    const { calls, controller } = createHarness();
    await controller.loadIfc({ downloadUrl: "http://storage.local/model.ifc" });

    controller.isolate({ ifcClass: "IfcWall" }, "Murs");

    expect(controller.getSnapshot().catalog?.storeys).toHaveLength(1);
    expect(controller.getSnapshot().visual).toMatchObject({
      mode: "isolate",
      label: "Murs",
      matchCount: 1,
      showContext: true,
      contextOpacity: 0.1,
    });

    controller.setIsolationContext(false, 0.25);
    expect(controller.getSnapshot().visual).toMatchObject({
      showContext: false,
      contextOpacity: 0.25,
    });

    controller.color({ ifcClass: "IfcDoor" }, [0.5, 0.1, 0.8, 1]);
    expect(calls.colorOverridesSet).toBe(1);
    expect(calls.rendererCreated).toBe(1);
    expect(calls.fitToView).toBe(1);
    controller.dispose();
  });

  it("streams a point cloud into the same renderer and updates GPU settings live", async () => {
    const { calls, controller } = createHarness();
    await controller.loadIfc({ downloadUrl: "http://storage.local/model.ifc" });

    await controller.loadPointCloud({
      assetId: "point-cloud-id",
      fileName: "scan.las",
      downloadUrl: "http://storage.local/scan.las",
      maxPointsInMemory: 2_000_000,
      transform: {
        position: [0, 0, 0],
        rotationDegrees: [-90, 0, 0],
        scale: [1, 1, 1],
      },
    });

    expect(controller.getSnapshot().pointClouds).toMatchObject([
      {
        assetId: "point-cloud-id",
        phase: "ready",
        progress: 1,
        pointCount: 2,
      },
    ]);
    expect(calls.pointCloudsBegun).toBe(1);
    expect(calls.pointCloudChunks).toBe(1);
    expect(calls.pointCloudTransforms).toBe(1);
    expect(calls.fitToView).toBe(1);

    controller.setPointCloudPointSize(4);
    controller.setPointCloudTransform("point-cloud-id", {
      position: [10, 0, 0],
      rotationDegrees: [-90, 0, 0],
      scale: [1, 1, 1],
    });

    expect(calls.pointCloudOptions).toBe(1);
    expect(calls.pointCloudTransforms).toBe(2);
    expect(calls.fitToView).toBe(1);
    controller.dispose();
  });

  it("round-trips a BCF viewpoint without recreating or reframing the renderer", async () => {
    const { calls, controller } = createHarness();
    await controller.loadIfc({ downloadUrl: "http://storage.local/model.ifc" });
    controller.selectEntity(42);
    controller.applyVisualPlan({
      focusIds: [42],
      colors: [{ ids: [84], color: [0.5, 0.1, 0.8, 1] }],
      label: "Capture BCF",
    });

    const capture = await controller.captureBcfViewpoint();

    expect(capture.targetDistance).toBe(20);
    expect(capture.snapshot).toMatchObject({ type: "image/png" });
    expect(capture.data).toMatchObject({
      perspectiveCamera: { aspectRatio: 16 / 9 },
      components: {
        selection: [{ ifcGuid: "3vB1mExampleGlobalId" }],
        visibility: {
          defaultVisibility: false,
          exceptions: [{ ifcGuid: "3vB1mExampleGlobalId" }],
        },
      },
    });

    controller.resetVisuals();
    controller.selectEntity(null);
    controller.applyBcfViewpoint(capture.data, capture.targetDistance);

    expect(controller.getSnapshot()).toMatchObject({
      selection: { expressId: 42 },
      visual: { mode: "isolate", label: "Viewpoint BCF" },
    });
    expect(calls.cameraPosesApplied).toBeGreaterThanOrEqual(5);
    expect(calls.rendererCreated).toBe(1);
    expect(calls.fitToView).toBe(1);
    controller.dispose();
  });
});
