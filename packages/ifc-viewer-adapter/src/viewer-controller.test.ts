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
import { ServerEntityIndex } from "@ifc-lite/server-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createIfcBimIndex, type IfcBimQuery } from "./bim-index";
import {
  IfcViewerController,
  type IfcViewerRuntime,
} from "./viewer-controller";

function createHarness({
  rendererInit,
}: { rendererInit?: () => Promise<void> } = {}) {
  const calls = {
    rendererCreated: 0,
    rendererInitialized: 0,
    geometryInitialized: 0,
    serverClientCreated: 0,
    sceneCleared: 0,
    colorOverridesSet: 0,
    colorOverridesCleared: 0,
    colorOverrides: new Map<number, [number, number, number, number]>(),
    batchesAdded: 0,
    streamingFinalized: 0,
    meshIds: [] as number[][],
    bimIndexIds: [] as number[][],
    fitToView: 0,
    frames: [] as Array<{
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
    }>,
    presetViews: [] as { view: string; bounds: object }[],
    orbit: 0,
    pan: 0,
    panDeltas: [] as { x: number; y: number }[],
    zoom: 0,
    pick: 0,
    pickOptions: null as Parameters<Renderer["pick"]>[2] | null,
    orbitCenter: null as { x: number; y: number; z: number } | null,
    rendererDestroyed: 0,
    geometryDisposed: 0,
    pointCloudsBegun: 0,
    pointCloudChunks: 0,
    pointCloudTransforms: 0,
    pointCloudOptions: 0,
    pointCloudsRemoved: 0,
    cameraPosesApplied: 0,
    lastRenderOptions: null as Parameters<Renderer["render"]>[0] | null,
  };
  let renderRequested = false;
  let pickExpressId = 42;
  let pickWorldXYZ: { x: number; y: number; z: number } | null = {
    x: 1,
    y: 3,
    z: 5,
  };
  let cameraPosition = { x: 12, y: 8, z: 20 };
  let cameraTarget = { x: 2, y: 3, z: 4 };
  let cameraUp = { x: 0, y: 1, z: 0 };
  let projection: "perspective" | "orthographic" = "perspective";
  let orthoSize = 10;
  let cameraRotation = { azimuth: 0, elevation: 0 };
  let cameraBounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  } | null = null;
  let raycastDepth: number | null | undefined;
  let pickedBounds = {
    min: { x: 0, y: 2, z: 4 },
    max: { x: 2, y: 4, z: 6 },
  };
  let frameCallback: ((time: number) => void) | null = null;
  const camera = {
    frameBounds: async (
      min: { x: number; y: number; z: number },
      max: { x: number; y: number; z: number },
    ) => {
      calls.frames.push({ min, max });
    },
    update: () => false,
    orbit: () => {
      calls.orbit += 1;
    },
    pan: (x: number, y: number) => {
      calls.pan += 1;
      calls.panDeltas.push({ x, y });
    },
    zoom: () => {
      calls.zoom += 1;
    },
    setOrbitCenter: (center: { x: number; y: number; z: number } | null) => {
      calls.orbitCenter = center;
    },
    getPosition: () => cameraPosition,
    unprojectToRay: () => {
      const distance = Math.hypot(
        cameraTarget.x - cameraPosition.x,
        cameraTarget.y - cameraPosition.y,
        cameraTarget.z - cameraPosition.z,
      );
      return {
        origin: cameraPosition,
        direction: {
          x: (cameraTarget.x - cameraPosition.x) / distance,
          y: (cameraTarget.y - cameraPosition.y) / distance,
          z: (cameraTarget.z - cameraPosition.z) / distance,
        },
      };
    },
    getViewProjMatrix: () => ({
      m: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    }),
    projectToScreen: (
      point: { x: number; y: number; z: number },
      width: number,
      height: number,
    ) => ({ x: width / 2 + point.x, y: height / 2 - point.y }),
    getTarget: () => cameraTarget,
    getUp: () => cameraUp,
    getFOV: () => Math.PI / 3,
    getAspect: () => 16 / 9,
    getDistance: () => 20,
    getRotation: () => ({ ...cameraRotation }),
    getSceneBounds: () => cameraBounds,
    setPresetView: (view: string, bounds: object) => {
      calls.presetViews.push({ view, bounds });
      cameraRotation =
        view === "top"
          ? { azimuth: 0, elevation: 90 }
          : { azimuth: 90, elevation: 0 };
    },
    getProjectionMode: () => projection,
    getOrthoSize: () => orthoSize,
    stopInertia: () => undefined,
    setProjectionMode: (value: "perspective" | "orthographic") => {
      if (projection === "perspective" && value === "orthographic") {
        orthoSize =
          Math.hypot(
            cameraPosition.x - cameraTarget.x,
            cameraPosition.y - cameraTarget.y,
            cameraPosition.z - cameraTarget.z,
          ) * Math.tan(Math.PI / 6);
      }
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
    setOrthoSize: (size: number) => {
      orthoSize = size;
      calls.cameraPosesApplied += 1;
    },
  };
  const scene = {
    raycast: () =>
      raycastDepth === null ? null : { expressId: 42, distance: raycastDepth },
    clear: () => {
      calls.sceneCleared += 1;
    },
    hasQueuedMeshes: () => false,
    flushPending: () => false,
    finalizeStreamingAsync: async () => {
      calls.streamingFinalized += 1;
    },
    getEntityBoundingBox: () => pickedBounds,
    getBounds: () => ({
      min: { x: 0, y: 2, z: 4 },
      max: { x: 2, y: 4, z: 6 },
    }),
    getAllMeshDataExpressIds: () => [42, 84],
    removeMeshesForEntities: () => 0,
    translateMeshesForEntities: () => 0,
    setColorOverrides: (
      colors: Map<number, [number, number, number, number]>,
    ) => {
      calls.colorOverridesSet += 1;
      calls.colorOverrides = new Map(colors);
    },
    clearColorOverrides: () => {
      calls.colorOverridesCleared += 1;
      calls.colorOverrides.clear();
    },
  };
  const renderer = {
    init: async () => {
      calls.rendererInitialized += 1;
      await rendererInit?.();
    },
    onDeviceLost: () => () => undefined,
    resize: () => undefined,
    getScene: () => scene,
    clearCaches: () => undefined,
    getCamera: () => camera,
    raycastScene: () => {
      if (raycastDepth === null) return null;
      const ray = camera.unprojectToRay();
      const depth =
        raycastDepth ??
        Math.hypot(
          cameraTarget.x - cameraPosition.x,
          cameraTarget.y - cameraPosition.y,
          cameraTarget.z - cameraPosition.z,
        );
      return {
        intersection: {
          point: {
            x: ray.origin.x + ray.direction.x * depth,
            y: ray.origin.y + ray.direction.y * depth,
            z: ray.origin.z + ray.direction.z * depth,
          },
        },
      };
    },
    getGPUDevice: () => ({}),
    getPipeline: () => ({}),
    addMeshes: (meshes: MeshData[]) => {
      calls.batchesAdded += 1;
      calls.meshIds.push(meshes.map((mesh) => mesh.expressId));
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
    render: (options: Parameters<Renderer["render"]>[0]) => {
      calls.lastRenderOptions = options;
    },
    pick: async (
      _x: number,
      _y: number,
      options: Parameters<Renderer["pick"]>[2],
    ) => {
      calls.pick += 1;
      calls.pickOptions = options;
      return {
        expressId: pickExpressId,
        ...(pickWorldXYZ ? { worldXYZ: pickWorldXYZ } : {}),
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
    captureColorFrame: async () => ({
      width: 1,
      height: 1,
      rgba: new Uint8ClampedArray([1, 2, 3, 255]),
    }),
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
        meshes: [
          {
            expressId: 42,
            positions: new Float32Array([0, 0, 0]),
            normals: new Float32Array([0, 1, 0]),
            indices: new Uint32Array([0]),
            color: [0.4, 0.5, 0.6, 1],
          },
        ],
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
    parseColumnar: async () =>
      ({
        entityCount: 3,
        entityIndex: { byId: { keys: () => [42, 84][Symbol.iterator]() } },
        entities: {
          getTypeName: (id: number) => (id === 42 ? "IfcWall" : "IfcDoor"),
        },
        spatialHierarchy: {
          elementToStorey: new Map([
            [42, 10],
            [84, 10],
          ]),
        },
      }) as unknown as IfcDataStore,
  } as unknown as IfcParser;
  const canvasListeners = new Map<string, (event: Event) => void>();
  const canvas = {
    width: 1_000,
    height: 700,
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
        async stream(
          onBatch: (batch: {
            batch_number: number;
            decode_time_ms: number;
            meshes: ServerMeshData[];
          }) => void,
        ) {
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

          const result = {
            cache_key: "sha256-model-medium",
            total_meshes: 1,
            stats: { from_cache: true },
            metadata: { schema_version: "IFC4" },
          } as unknown as ParquetStreamResult;
          return {
            result,
            maxExpressId: 42,
            dataModel: {
              entities: ServerEntityIndex.fromRows([
                {
                  entity_id: 1,
                  type_name: "IfcProject",
                  has_geometry: false,
                },
                {
                  entity_id: 10,
                  type_name: "IfcBuildingStorey",
                  name: "Niveau 1",
                  has_geometry: false,
                },
                { entity_id: 42, type_name: "IfcWall", has_geometry: true },
              ]),
              propertySets: new Map(),
              quantitySets: new Map(),
              relationships: [],
              classifications: [],
              materials: [],
              documents: [],
              spatialHierarchy: {
                nodes: [
                  {
                    entity_id: 1,
                    parent_id: 0,
                    level: 0,
                    path: "1",
                    type_name: "IfcProject",
                    children_ids: [10],
                    element_ids: [],
                  },
                  {
                    entity_id: 10,
                    parent_id: 1,
                    level: 1,
                    path: "1/10",
                    type_name: "IfcBuildingStorey",
                    name: "Niveau 1",
                    children_ids: [],
                    element_ids: [42],
                  },
                ],
                project_id: 1,
                element_to_storey: new Map([[42, 10]]),
                element_to_building: new Map(),
                element_to_site: new Map(),
                element_to_space: new Map(),
              },
            },
          };
        },
      };
    },
    createBimIndex: (store, renderableIds) => {
      calls.bimIndexIds.push([...renderableIds]);
      if (store.source?.byteLength === 0)
        return createIfcBimIndex(store, renderableIds);
      const elements = [
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
      ];
      const matchingIds = (query: IfcBimQuery) =>
        elements
          .filter(
            (element) =>
              (!query.ifcClasses?.length ||
                query.ifcClasses.includes(element.ifcClass)) &&
              (!query.storeyIds?.length ||
                query.storeyIds.includes(element.storeyId)),
          )
          .map((element) => element.expressId);
      return {
        catalog: {
          unassignedCount: 0,
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
        count: (query) => matchingIds(query).length,
        findIds: matchingIds,
        getElement: (expressId) =>
          elements.find((element) => element.expressId === expressId) ?? null,
        query: () => elements,
        queryPage: () => [],
        classesForStorey: () => [
          { ifcClass: "IfcWall", elementCount: 1 },
          { ifcClass: "IfcDoor", elementCount: 1 },
        ],
      };
    },
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
        normalState: "absent",
        pointCount: 2,
        bbox: { min: [0, 0, 0], max: [1, 1, 1] },
      });
      options.onProgress?.(2, 2);
      options.onComplete?.({ min: [0, 0, 0], max: [1, 1, 1] }, 2, null);
      return { cancel: () => undefined, done: Promise.resolve() };
    },
    createPointCloudCopcStream: (options) => {
      let updateCount = 0;
      options.onOpen?.({ totalPointCount: 10_000_000 });
      return {
        ready: Promise.resolve(),
        update: () => {
          updateCount += 1;
          if (updateCount === 1) {
            options.onSwap({
              add: [
                {
                  nodeId: "r",
                  chunk: {
                    positions: new Float32Array([0, 0, 0]),
                    pointCount: 1,
                    bbox: { min: [0, 0, 0], max: [0, 0, 0] },
                  },
                },
              ],
              remove: [],
              pointCount: 1,
              nodeCount: 1,
              complete: false,
            });
          } else {
            options.onSwap({
              add: [
                {
                  nodeId: "r0",
                  chunk: {
                    positions: new Float32Array([0, 0, 0]),
                    pointCount: 1,
                    bbox: { min: [0, 0, 0], max: [0, 0, 0] },
                  },
                },
                {
                  nodeId: "r1",
                  chunk: {
                    positions: new Float32Array([1, 1, 1]),
                    pointCount: 1,
                    bbox: { min: [1, 1, 1], max: [1, 1, 1] },
                  },
                },
              ],
              remove: ["r"],
              pointCount: 2,
              nodeCount: 2,
              complete: true,
            });
          }
        },
        cancel: () => undefined,
      };
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
    requestFrame: (callback) => {
      frameCallback = callback;
      return 1;
    },
    cancelFrame: () => undefined,
    createResizeObserver: () => ({
      observe: () => undefined,
      disconnect: () => undefined,
    }),
  };

  return {
    calls,
    controller: new IfcViewerController(canvas, runtime),
    setCanvasPixelSize(width: number, height: number) {
      canvas.width = width;
      canvas.height = height;
    },
    advanceFrame(time = 16) {
      frameCallback?.(time);
    },
    setCameraBounds(bounds: NonNullable<typeof cameraBounds>) {
      cameraBounds = bounds;
    },
    setRaycastDepth(depth: number | null) {
      raycastDepth = depth;
    },
    setPickWorldXYZ(point: typeof pickWorldXYZ) {
      pickWorldXYZ = point;
    },
    setPickedBounds(bounds: typeof pickedBounds) {
      pickedBounds = bounds;
    },
    setExternalProjectionMode(mode: "perspective" | "orthographic") {
      projection = mode;
    },
    getCameraPose() {
      return {
        position: { ...cameraPosition },
        target: { ...cameraTarget },
        projection,
        orthoSize,
      };
    },
    zoomOrthographic(factor: number) {
      orthoSize *= factor;
    },
    setPickExpressId(id: number) {
      pickExpressId = id;
    },
    dispatch(type: string, event: object) {
      canvasListeners.get(type)?.(event as Event);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("IfcViewerController", () => {
  it("frames only a loaded model without recreating the renderer", async () => {
    const { controller, calls } = createHarness();
    controller.frameModel("missing");
    expect(calls.frames).toHaveLength(0);
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "model.ifc",
      downloadUrl: "http://storage.local/model.ifc",
    });
    controller.frameModel("model-a");
    expect(calls.frames).toEqual([
      { min: { x: 0, y: 2, z: 4 }, max: { x: 2, y: 4, z: 6 } },
    ]);
    expect(calls.rendererCreated).toBe(1);
    controller.dispose();
    controller.frameModel("model-a");
    expect(calls.frames).toHaveLength(1);
  });
  it("captures a detached visual plan for undo and resets layer overrides separately", async () => {
    const { controller } = createHarness();
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "model.ifc",
      downloadUrl: "http://storage.local/model.ifc",
    });
    controller.applyVisualPlan({
      focusIds: [42],
      label: "Selected",
      colors: [{ ids: [42], color: [0.2, 0.3, 0.4, 1] }],
    });
    const plan = controller.getVisualPlan();
    controller.resetVisuals();
    expect(controller.getSnapshot().visual.mode).toBe("all");
    controller.applyVisualPlan(plan);
    expect(controller.getSnapshot().visual).toMatchObject({
      mode: "isolate",
      label: "Selected",
    });
    controller.setLayerVisibility(
      "model-a",
      { kind: "element", expressId: 42 },
      "hide",
    );
    controller.resetLayerVisibility();
    expect(
      controller.getLayerVisibility("model-a", {
        kind: "element",
        expressId: 42,
      }),
    ).toBe("show");
    expect(controller.getSnapshot().visual.mode).toBe("isolate");
    controller.dispose();
  });

  it("updates the scene background without recreating or reframing the renderer", async () => {
    const { calls, controller, advanceFrame } = createHarness();
    await controller.init();

    controller.setBackgroundColor([0.12, 0.12, 0.12, 1]);
    advanceFrame();

    expect(calls.lastRenderOptions?.clearColor).toEqual([0.12, 0.12, 0.12, 1]);
    expect(calls.rendererCreated).toBe(1);
    expect(calls.fitToView).toBe(0);
    controller.dispose();
  });

  it("projects world anchors into CSS pixels for scene overlays", () => {
    const { controller, setCanvasPixelSize } = createHarness();
    setCanvasPixelSize(500, 350);
    expect(controller.projectWorldPoint({ x: 10, y: 5, z: 0 })).toEqual({
      x: 520,
      y: 340,
    });
    controller.dispose();
  });

  it("passes section options to IFC-Lite without changing camera or renderer", async () => {
    const { calls, controller, advanceFrame } = createHarness();
    await controller.init();

    controller.setSectionAxis("front");
    controller.setSectionPosition(25);
    advanceFrame();
    expect(calls.lastRenderOptions?.sectionPlane).toMatchObject({
      axis: "front",
      position: 25,
      enabled: true,
    });
    expect(calls.rendererCreated).toBe(1);
    expect(calls.fitToView).toBe(0);

    controller.showSectionBox();
    advanceFrame(32);
    expect(calls.lastRenderOptions?.clipBox?.enabled).toBe(true);
    expect(calls.lastRenderOptions?.sectionPlane).toBeUndefined();

    controller.hideSection();
    advanceFrame(48);
    expect(calls.lastRenderOptions?.clipBox).toBeUndefined();
    expect(calls.lastRenderOptions?.sectionPlane).toBeUndefined();
    controller.dispose();
  });

  it("switches projection without reframing and reflects external camera changes", async () => {
    const { calls, controller, advanceFrame, setExternalProjectionMode } =
      createHarness();
    const modes: string[] = [];
    const unsubscribe = controller.subscribeProjectionMode((mode) =>
      modes.push(mode),
    );

    await controller.init();
    await controller.setProjectionMode("orthographic");
    const poseChanges = calls.cameraPosesApplied;
    await controller.setProjectionMode("orthographic");
    expect(calls.cameraPosesApplied).toBe(poseChanges);
    advanceFrame();
    expect(modes).toEqual(["perspective", "orthographic"]);
    expect(calls.fitToView).toBe(0);
    expect(calls.rendererCreated).toBe(1);

    setExternalProjectionMode("perspective");
    advanceFrame(32);
    expect(modes).toEqual(["perspective", "orthographic", "perspective"]);

    unsubscribe();
    controller.dispose();
  });

  it("keeps the same camera framing when returning from an orthographic zoom", async () => {
    for (const zoomFactor of [0.4, 2]) {
      const { calls, controller, getCameraPose, zoomOrthographic } =
        createHarness();
      await controller.init();
      const initial = getCameraPose();

      await controller.setProjectionMode("orthographic");
      zoomOrthographic(zoomFactor);
      const orthoSize = getCameraPose().orthoSize;
      await controller.setProjectionMode("perspective");
      const perspective = getCameraPose();

      for (const axis of ["x", "y", "z"] as const) {
        expect(perspective.target[axis]).toBeCloseTo(initial.target[axis]);
        expect(
          perspective.position[axis] - perspective.target[axis],
        ).toBeCloseTo(
          (initial.position[axis] - initial.target[axis]) * zoomFactor,
          8,
        );
      }

      await controller.setProjectionMode("orthographic");
      expect(getCameraPose().orthoSize).toBeCloseTo(orthoSize, 8);
      expect(calls.fitToView).toBe(0);
      expect(calls.rendererCreated).toBe(1);
      controller.dispose();
    }
  });

  it("anchors projection scale to visible geometry instead of a distant camera target", async () => {
    const {
      calls,
      controller,
      getCameraPose,
      setRaycastDepth,
      zoomOrthographic,
    } = createHarness();
    setRaycastDepth(5);
    await controller.init();
    const initial = getCameraPose();
    const initialDistance = Math.hypot(
      initial.target.x - initial.position.x,
      initial.target.y - initial.position.y,
      initial.target.z - initial.position.z,
    );
    const direction = {
      x: (initial.target.x - initial.position.x) / initialDistance,
      y: (initial.target.y - initial.position.y) / initialDistance,
      z: (initial.target.z - initial.position.z) / initialDistance,
    };
    const visibleSurface = {
      x: initial.position.x + direction.x * 5,
      y: initial.position.y + direction.y * 5,
      z: initial.position.z + direction.z * 5,
    };

    await controller.setProjectionMode("orthographic");
    expect(getCameraPose().orthoSize).toBeCloseTo(5 * Math.tan(Math.PI / 6));
    zoomOrthographic(0.4);
    const zoomedOrthoSize = getCameraPose().orthoSize;
    await controller.setProjectionMode("perspective");
    const perspective = getCameraPose();

    for (const axis of ["x", "y", "z"] as const) {
      expect(perspective.target[axis]).toBeCloseTo(visibleSurface[axis]);
      expect(perspective.position[axis]).toBeCloseTo(
        visibleSurface[axis] -
          direction[axis] * (zoomedOrthoSize / Math.tan(Math.PI / 6)),
      );
    }
    expect(calls.fitToView).toBe(0);
    expect(calls.rendererCreated).toBe(1);
    controller.dispose();
  });

  it("uses the picked entity bounds when a large model has released CPU triangles", async () => {
    const {
      calls,
      controller,
      getCameraPose,
      setRaycastDepth,
      setPickWorldXYZ,
      setPickedBounds,
    } = createHarness();
    setRaycastDepth(null);
    setPickWorldXYZ(null);
    const initial = getCameraPose();
    const distance = Math.hypot(
      initial.target.x - initial.position.x,
      initial.target.y - initial.position.y,
      initial.target.z - initial.position.z,
    );
    const surface = {
      x:
        initial.position.x +
        ((initial.target.x - initial.position.x) / distance) * 5,
      y:
        initial.position.y +
        ((initial.target.y - initial.position.y) / distance) * 5,
      z:
        initial.position.z +
        ((initial.target.z - initial.position.z) / distance) * 5,
    };
    setPickedBounds({
      min: { x: surface.x - 1, y: surface.y - 1, z: surface.z - 1 },
      max: { x: surface.x + 1, y: surface.y + 1, z: surface.z + 1 },
    });

    await controller.init();
    await controller.setProjectionMode("orthographic");

    expect(calls.pick).toBe(1);
    expect(getCameraPose().orthoSize).toBeGreaterThan(
      2 * Math.tan(Math.PI / 6),
    );
    expect(getCameraPose().orthoSize).toBeLessThan(5 * Math.tan(Math.PI / 6));
    controller.dispose();
  });

  it("uses IFC-Lite's picked world point when no IFC surface is raycastable", async () => {
    const {
      calls,
      controller,
      getCameraPose,
      setRaycastDepth,
      setPickWorldXYZ,
    } = createHarness();
    setRaycastDepth(null);
    const initial = getCameraPose();
    const distance = Math.hypot(
      initial.target.x - initial.position.x,
      initial.target.y - initial.position.y,
      initial.target.z - initial.position.z,
    );
    setPickWorldXYZ({
      x:
        initial.position.x +
        ((initial.target.x - initial.position.x) / distance) * 5,
      y:
        initial.position.y +
        ((initial.target.y - initial.position.y) / distance) * 5,
      z:
        initial.position.z +
        ((initial.target.z - initial.position.z) / distance) * 5,
    });

    await controller.init();
    await controller.setProjectionMode("orthographic");

    expect(calls.pick).toBe(1);
    expect(getCameraPose().orthoSize).toBeCloseTo(5 * Math.tan(Math.PI / 6));
    controller.dispose();
  });

  it("does not move the camera when toggling projection without zooming", async () => {
    const { controller, getCameraPose } = createHarness();
    await controller.init();
    const initial = getCameraPose();

    await controller.setProjectionMode("orthographic");
    await controller.setProjectionMode("perspective");

    expect(getCameraPose().position).toEqual(initial.position);
    for (const axis of ["x", "y", "z"] as const) {
      expect(getCameraPose().target[axis]).toBeCloseTo(initial.target[axis]);
    }
    controller.dispose();
  });

  it("uses IFC-Lite camera presets and streams orientation without rebuilding the renderer", async () => {
    const { calls, controller, advanceFrame, setCameraBounds } =
      createHarness();
    const rotations: { azimuth: number; elevation: number }[] = [];
    const unsubscribe = controller.subscribeCameraRotation((rotation) =>
      rotations.push(rotation),
    );

    await controller.init();
    controller.setPresetView("top");
    advanceFrame();

    expect(calls.presetViews).toEqual([
      {
        view: "top",
        bounds: {
          min: { x: 0, y: 2, z: 4 },
          max: { x: 2, y: 4, z: 6 },
        },
      },
    ]);
    expect(rotations).toEqual([
      { azimuth: 0, elevation: 0 },
      { azimuth: 0, elevation: 90 },
    ]);

    const combinedBounds = {
      min: { x: -10, y: -10, z: -10 },
      max: { x: 20, y: 20, z: 20 },
    };
    setCameraBounds(combinedBounds);
    controller.setPresetView("left");
    advanceFrame(32);
    advanceFrame(48);

    expect(calls.presetViews[1]).toEqual({
      view: "left",
      bounds: combinedBounds,
    });
    expect(rotations.at(-1)).toEqual({ azimuth: 90, elevation: 0 });
    expect(rotations).toHaveLength(3);
    expect(calls.rendererCreated).toBe(1);
    expect(calls.fitToView).toBe(0);

    controller.orbitFromViewCube(8, -4);
    expect(calls.orbit).toBe(1);
    expect(calls.rendererCreated).toBe(1);

    unsubscribe();
    controller.dispose();
  });

  it("initializes one renderer and one geometry processor", async () => {
    const { calls, controller } = createHarness();

    await Promise.all([controller.init(), controller.init()]);

    expect(calls.rendererCreated).toBe(1);
    expect(calls.rendererInitialized).toBe(1);
    expect(calls.geometryInitialized).toBe(1);
    controller.dispose();
  });

  it("federates two IFC files without clearing the scene or reframing between loads", async () => {
    const { calls, controller } = createHarness();
    const phases: string[] = [];
    controller.subscribe((snapshot) => phases.push(snapshot.phase));

    await controller.loadIfc({
      assetId: "model-a",
      fileName: "model.ifc",
      downloadUrl: "http://storage.local/model.ifc",
    });

    expect(controller.getSnapshot()).toMatchObject({
      phase: "ready",
      meshCount: 1,
      entityCount: 3,
    });
    expect(calls.batchesAdded).toBe(1);
    expect(calls.fitToView).toBe(0);
    expect(phases).toContain("processing");

    await controller.loadIfc({
      assetId: "model-b",
      fileName: "model-2.ifc",
      downloadUrl: "http://storage.local/model-2.ifc",
    });

    expect(calls.rendererCreated).toBe(1);
    expect(calls.sceneCleared).toBe(0);
    expect(calls.meshIds).toEqual([[42], [1_000_127]]);
    expect(controller.getSnapshot().models).toHaveLength(2);
    controller.fitToView();
    expect(calls.fitToView).toBe(1);
    controller.dispose();
  });

  it("streams Parquet geometry through the Rust server without replacing the renderer", async () => {
    const { calls, controller } = createHarness();

    await controller.loadIfc({
      assetId: "model-a",
      fileName: "large-model.ifc",
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
    expect(calls.bimIndexIds).toEqual([[42]]);
    expect(controller.getSnapshot().catalog).toMatchObject({
      storeys: [{ name: "Niveau 1", elementCount: 1 }],
      unassignedCount: 0,
    });
    await controller.loadIfc({
      assetId: "model-b",
      fileName: "second-large-model.ifc",
      downloadUrl: "http://storage.local/second-large-model.ifc",
      processing: {
        engine: "rust",
        serverBaseUrl: "http://ifc-server.local",
      },
    });
    expect(calls.bimIndexIds).toEqual([[42], [42]]);
    expect(calls.meshIds[1]?.[0]).toBeGreaterThan(42);
    expect(
      controller.getSnapshot().models[1]?.catalog?.storeys[0],
    ).toMatchObject({
      name: "Niveau 1",
      elementCount: 1,
    });
    expect(calls.rendererCreated).toBe(1);
    controller.fitToView();
    expect(calls.fitToView).toBe(1);
    controller.dispose();
  });

  it("resolves a picked Express ID to the correct IFC when both source files reuse it", async () => {
    const { calls, controller, dispatch, setPickExpressId } = createHarness();
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "arch.ifc",
      downloadUrl: "http://storage.local/arch.ifc",
    });
    await controller.loadIfc({
      assetId: "model-b",
      fileName: "mep.ifc",
      downloadUrl: "http://storage.local/mep.ifc",
    });

    setPickExpressId(1_000_127);
    dispatch("pointerdown", {
      type: "pointerdown",
      button: 0,
      shiftKey: false,
      clientX: 100,
      clientY: 120,
      pointerId: 9,
    });
    dispatch("pointerup", {
      type: "pointerup",
      button: 0,
      clientX: 100,
      clientY: 120,
      pointerId: 9,
    });
    await Promise.resolve();

    expect(controller.getSnapshot().activeModelId).toBe("model-b");
    expect(controller.getSnapshot().selection?.expressId).toBe(42);
    controller.setLayerVisibility("model-a", { kind: "model" }, "hide");
    expect(controller.getLayerVisibility("model-a", { kind: "model" })).toBe(
      "hide",
    );
    expect(calls.sceneCleared).toBe(0);
    expect(calls.fitToView).toBe(0);
    controller.dispose();
  });

  it("cycles independent BIM layers without recreating the renderer or moving the camera", async () => {
    const { calls, controller } = createHarness();
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "arch.ifc",
      downloadUrl: "http://storage.local/arch.ifc",
    });
    await controller.loadIfc({
      assetId: "model-b",
      fileName: "mep.ifc",
      downloadUrl: "http://storage.local/mep.ifc",
    });

    expect(calls.streamingFinalized).toBe(2);
    controller.setLayerVisibility("model-a", { kind: "model" }, "opacity");
    expect(controller.getLayerVisibility("model-a", { kind: "model" })).toBe(
      "opacity",
    );
    expect(controller.getLayerVisibility("model-b", { kind: "model" })).toBe(
      "show",
    );
    controller.setLayerVisibility(
      "model-a",
      { kind: "storey", expressId: 10 },
      "hide",
    );
    expect(
      controller.getLayerVisibility("model-a", {
        kind: "storey",
        expressId: 10,
      }),
    ).toBe("hide");
    controller.setLayerVisibility("model-a", { kind: "model" }, "show");

    controller.setLayerVisibility("model-a", { kind: "model" }, "hide");
    controller.setLayerVisibility(
      "model-a",
      { kind: "class", storeyId: 10, ifcClass: "IfcWall" },
      "show",
    );
    expect(
      controller.getLayerVisibility("model-a", {
        kind: "element",
        expressId: 42,
      }),
    ).toBe("show");
    expect(
      controller.getLayerVisibility("model-a", {
        kind: "element",
        expressId: 84,
      }),
    ).toBe("hide");
    // Only #42 has rendered geometry in this fixture; #84 cannot make it mixed.
    expect(
      controller.getLayerExceptionCount("model-a", { kind: "model" }),
    ).toBe(0);
    expect(
      controller.getLayerExceptionCount("model-a", {
        kind: "storey",
        expressId: 10,
      }),
    ).toBe(0);

    expect(calls.streamingFinalized).toBe(2);
    expect(calls.rendererCreated).toBe(1);
    expect(calls.fitToView).toBe(0);
    expect(calls.cameraPosesApplied).toBe(0);
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

  it("scales Shift-drag panning with orthographic zoom", async () => {
    const {
      calls,
      controller,
      dispatch,
      getCameraPose,
      setExternalProjectionMode,
      zoomOrthographic,
    } = createHarness();
    await controller.init();

    const drag = (pointerId: number) => {
      dispatch("pointerdown", {
        button: 0,
        shiftKey: true,
        clientX: 100,
        clientY: 100,
        pointerId,
      });
      dispatch("pointermove", {
        clientX: 140,
        clientY: 120,
        pointerId,
      });
      dispatch("pointerup", { button: 0, pointerId, type: "pointerup" });
    };

    drag(1);
    expect(calls.panDeltas[0]).toEqual({ x: 40, y: 20 });

    setExternalProjectionMode("orthographic");
    zoomOrthographic((20 * Math.tan(Math.PI / 6)) / getCameraPose().orthoSize);
    drag(2);
    expect(calls.panDeltas[1].x).toBeCloseTo(40);
    expect(calls.panDeltas[1].y).toBeCloseTo(20);

    zoomOrthographic(0.25);
    drag(3);
    expect(calls.panDeltas[2].x).toBeCloseTo(10);
    expect(calls.panDeltas[2].y).toBeCloseTo(5);
    expect(calls.fitToView).toBe(0);
    expect(calls.rendererCreated).toBe(1);
    controller.dispose();
  });

  it.each([true, false])(
    "anchors a direct drag to the picked object (surface available: %s)",
    async (hasSurface) => {
      const { calls, controller, dispatch, setPickWorldXYZ, setPickedBounds } =
        createHarness();
      await controller.loadIfc({
        assetId: "model-a",
        fileName: "model.ifc",
        downloadUrl: "http://storage.local/model.ifc",
      });
      const center = { x: 8, y: 9, z: 10 };
      setPickWorldXYZ(hasSurface ? center : null);
      setPickedBounds({
        min: { x: 6, y: 7, z: 8 },
        max: { x: 10, y: 11, z: 12 },
      });
      controller.applyVisualPlan({
        hiddenIds: new Set([84]),
        focusIds: new Set([42]),
        showContext: false,
      });
      dispatch("pointerdown", {
        button: 0,
        clientX: 100,
        clientY: 120,
        pointerId: 7,
      });
      dispatch("pointermove", { clientX: 130, clientY: 140, pointerId: 7 });
      await vi.waitFor(() => expect(calls.orbit).toBe(1));
      dispatch("pointerup", { type: "pointerup", button: 0, pointerId: 7 });

      expect(calls.pick).toBe(1);
      expect(calls.pickOptions).toMatchObject({
        hiddenIds: new Set([84]),
        isolatedIds: new Set([42]),
      });
      expect(calls.orbitCenter).toEqual(center);
      expect(controller.getSnapshot().selection).toBeNull();
      expect(calls.rendererCreated).toBe(1);
      expect(calls.fitToView).toBe(0);
      controller.dispose();
    },
  );

  it.each(["measurement", "section"])(
    "keeps the navigation pivot while the %s tool is picking",
    async (tool) => {
      const { calls, controller, dispatch } = createHarness();
      await controller.loadIfc({
        assetId: "model-a",
        fileName: "model.ifc",
        downloadUrl: "http://storage.local/model.ifc",
      });
      if (tool === "measurement") controller.onMeasurementPick(() => undefined);
      else controller.startSectionPick("face");

      dispatch("pointerdown", {
        button: 0,
        clientX: 100,
        clientY: 120,
        pointerId: 7,
      });
      dispatch("pointermove", { clientX: 130, clientY: 140, pointerId: 7 });
      await vi.waitFor(() => expect(calls.orbit).toBe(1));
      expect(calls.pick).toBe(0);
      expect(calls.orbitCenter).toBeNull();
      controller.dispose();
    },
  );

  it("selects IFC semantics and uses the clicked surface as orbit center", async () => {
    const { calls, controller, dispatch } = createHarness();
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "model.ifc",
      downloadUrl: "http://storage.local/model.ifc",
    });

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
    controller.fitToView();
    expect(calls.fitToView).toBe(1);
    controller.dispose();
  });

  it("applies BIM filters without rebuilding or reframing the scene", async () => {
    const { calls, controller } = createHarness();
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "model.ifc",
      downloadUrl: "http://storage.local/model.ifc",
    });

    controller.isolate({ ifcClasses: ["IfcWall"] }, "Murs");

    expect(controller.getSnapshot().catalog?.storeys).toHaveLength(1);
    expect(controller.getSnapshot().visual).toMatchObject({
      mode: "isolate",
      label: "Murs",
      matchCount: 1,
      showContext: true,
      contextOpacity: 0.01,
    });

    controller.setIsolationContext(false, 0.25);
    expect(controller.getSnapshot().visual).toMatchObject({
      showContext: false,
      contextOpacity: 0.25,
    });

    controller.color({ ifcClasses: ["IfcDoor"] }, [0.5, 0.1, 0.8, 1]);
    expect(calls.colorOverridesSet).toBe(1);
    expect(calls.rendererCreated).toBe(1);
    controller.fitToView();
    expect(calls.fitToView).toBe(1);
    controller.dispose();
  });

  it("preserves project visual effects when selecting another active model", async () => {
    const { controller, calls } = createHarness();
    for (const assetId of ["model-a", "model-b"])
      await controller.loadIfc({
        assetId,
        fileName: `${assetId}.ifc`,
        downloadUrl: `http://storage.local/${assetId}.ifc`,
      });
    controller.isolate({ ifcClasses: ["IfcWall"] });
    const resets: string[] = [];
    const unsubscribe = controller.subscribe((snapshot) => {
      if (snapshot.visual.mode === "all")
        resets.push(snapshot.activeModelId ?? "");
    });
    resets.length = 0;
    const previous = controller.getVisualPlan();
    const visual = controller.getSnapshot().visual;
    const idsA = controller.findBimIds({ ifcClasses: ["IfcWall"] }, "model-a");
    const idsB = controller.findBimIds({ ifcClasses: ["IfcWall"] }, "model-b");
    expect(idsA).not.toEqual(idsB);
    expect(controller.countBim({ ifcClasses: ["IfcWall"] }, "model-b")).toBe(1);
    controller.setActiveModel("model-b");
    expect(controller.getVisualPlan()).toEqual(previous);
    expect(controller.getSnapshot().visual).toBe(visual);
    expect(resets).toEqual([]);
    expect(calls.rendererCreated).toBe(1);
    unsubscribe();
    controller.dispose();
  });

  it("preserves the requested colors while keeping colored context transparent", async () => {
    const { controller, calls, advanceFrame } = createHarness();
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "a.ifc",
      downloadUrl: "http://storage.local/a.ifc",
    });
    controller.applyVisualPlan({
      focusIds: [42],
      colors: [{ ids: [42, 84], color: [1, 0, 0, 1] }],
      showContext: true,
      contextOpacity: 0.18,
    });
    const requested = controller.getVisualPlan();
    expect([...calls.colorOverrides.keys()]).toEqual([42]);
    const uploads = calls.colorOverridesSet;
    controller.setIsolationContext(true, 0.3);
    advanceFrame();
    expect(calls.colorOverridesSet).toBe(uploads);
    expect(calls.lastRenderOptions?.ghostAlpha).toBe(0.3);
    controller.setIsolationContext(false, 0.3);
    expect([...calls.colorOverrides.keys()]).toEqual([42, 84]);
    controller.setIsolationContext(true, 0.3);
    expect([...calls.colorOverrides.keys()]).toEqual([42]);
    expect(controller.getVisualPlan().colors).toEqual(requested.colors);
    controller.applyVisualPlan({
      ...controller.getVisualPlan(),
      focusIds: [84],
    });
    expect([...calls.colorOverrides.keys()]).toEqual([84]);
    controller.applyVisualPlan({
      ...controller.getVisualPlan(),
      focusIds: [1234],
    });
    expect(calls.colorOverrides.size).toBe(0);
    controller.applyVisualPlan({
      ...controller.getVisualPlan(),
      focusIds: null,
    });
    expect([...calls.colorOverrides.keys()]).toEqual([42, 84]);
    expect(controller.getVisualPlan().colors).toEqual(requested.colors);
    expect(calls.rendererCreated).toBe(1);
    controller.dispose();
  });

  it.each([false, true])(
    "restores the original filters after repeated temporary isolation (context %s)",
    async (showContext) => {
      const { controller, calls, advanceFrame } = createHarness();
      await controller.loadIfc({
        assetId: "model-a",
        fileName: "a.ifc",
        downloadUrl: "http://storage.local/a.ifc",
      });
      controller.applyVisualPlan({
        focusIds: [42, 84],
        hiddenIds: [84],
        colors: [
          { ids: [42], color: [1, 0, 0, 1] },
          { ids: [84], color: [0, 1, 0, 1] },
        ],
        showContext,
        contextOpacity: 0.24,
        label: "Structure",
      });
      const original = controller.getVisualPlan();
      const originalVisual = controller.getSnapshot().visual;
      const originalRevision = controller.getSnapshot().visualRevision;
      const frames = calls.fitToView;
      controller.selectModelEntity("model-a", 84);
      controller.isolateSelection();
      advanceFrame();
      expect(controller.getSnapshot().selectionIsolationActive).toBe(true);
      expect(controller.getSnapshot().visual.showContext).toBe(showContext);
      expect(controller.getSnapshot().visualRevision).toBe(originalRevision);
      expect([...(controller.getVisualPlan().focusIds ?? [])]).toEqual([84]);
      expect(calls.lastRenderOptions?.isolatedIds).toEqual(
        showContext ? null : new Set([84]),
      );
      expect(calls.lastRenderOptions?.ghostExceptIds).toEqual(
        showContext ? new Set([84]) : null,
      );
      expect(calls.lastRenderOptions?.ghostAlpha).toBe(0.24);
      expect(
        Array.from(controller.getVisualPlan().colors ?? []).flatMap((group) => [
          ...group.ids,
        ]),
      ).toEqual([42, 84]);
      expect([...calls.colorOverrides.keys()]).toEqual(
        showContext ? [84] : [42, 84],
      );
      expect(calls.lastRenderOptions?.hiddenIds?.has(84)).toBe(false);
      controller.selectModelEntity("model-a", 42);
      controller.isolateSelection();
      expect([...(controller.getVisualPlan().focusIds ?? [])]).toEqual([42]);
      controller.clearSelectionIsolation();
      expect(controller.getVisualPlan()).toEqual(original);
      expect(controller.getSnapshot().visual).toEqual(originalVisual);
      expect(controller.getSnapshot().visualRevision).toBe(originalRevision);
      expect(controller.getSnapshot().selectionIsolationActive).toBe(false);
      controller.clearSelectionIsolation();
      expect(controller.getVisualPlan()).toEqual(original);
      expect(calls.rendererCreated).toBe(1);
      expect(calls.fitToView).toBe(frames);
      controller.dispose();
    },
  );

  it("updates context live during selection isolation and retains it after restoring filters", async () => {
    const { controller, calls, advanceFrame } = createHarness();
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "a.ifc",
      downloadUrl: "http://storage.local/a.ifc",
    });
    controller.applyVisualPlan({
      focusIds: [42],
      hiddenIds: [84],
      colors: [{ ids: [42, 84], color: [1, 0, 0, 1] }],
      showContext: false,
      contextOpacity: 0.1,
      label: "Structure",
    });
    const original = controller.getVisualPlan();
    const revision = controller.getSnapshot().visualRevision;
    controller.selectModelEntity("model-a", 84);
    controller.isolateSelection();
    // Editing context keeps the isolated ids even if the selection changes.
    controller.selectModelEntity("model-a", 42);
    controller.setIsolationContext(true, 0.3);
    advanceFrame();
    expect(controller.getSnapshot()).toMatchObject({
      selectionIsolationActive: true,
      visualRevision: revision + 1,
      visual: {
        label: "Sélection isolée",
        showContext: true,
        contextOpacity: 0.3,
      },
    });
    expect(calls.lastRenderOptions?.ghostExceptIds).toEqual(new Set([84]));
    expect(calls.lastRenderOptions?.isolatedIds).toBeNull();
    expect(calls.lastRenderOptions?.ghostAlpha).toBe(0.3);
    expect(
      Array.from(controller.getVisualPlan().colors ?? []).flatMap((group) => [
        ...group.ids,
      ]),
    ).toEqual([42, 84]);
    expect([...calls.colorOverrides.keys()]).toEqual([84]);
    controller.setIsolationContext(false, 0.3);
    advanceFrame();
    expect(calls.lastRenderOptions?.isolatedIds).toEqual(new Set([84]));
    expect(calls.lastRenderOptions?.ghostExceptIds).toBeNull();
    expect(controller.getSnapshot().selectionIsolationActive).toBe(true);
    controller.setIsolationContext(true, 0.18);
    controller.clearSelectionIsolation();
    advanceFrame();
    expect(controller.getSnapshot()).toMatchObject({
      selectionIsolationActive: false,
      visualRevision: revision + 3,
      visual: { label: "Structure", showContext: true, contextOpacity: 0.18 },
    });
    expect(controller.getVisualPlan()).toEqual({
      ...original,
      showContext: true,
      contextOpacity: 0.18,
    });
    expect(calls.lastRenderOptions?.ghostExceptIds).toEqual(new Set([42]));
    expect(calls.lastRenderOptions?.hiddenIds).toEqual(new Set([84]));
    controller.dispose();
  });

  it("maps temporary selection isolation to federated ids and lets new filters replace it", async () => {
    const { controller } = createHarness();
    controller.isolateSelection();
    expect(controller.getSnapshot().selectionIsolationActive).toBe(false);
    for (const assetId of ["model-a", "model-b"])
      await controller.loadIfc({
        assetId,
        fileName: `${assetId}.ifc`,
        downloadUrl: `http://storage.local/${assetId}.ifc`,
      });
    controller.setActiveModel("model-b");
    const ids = controller.findBimIds({ ifcClasses: ["IfcWall"] });
    controller.selectModelEntity("model-b", 42);
    controller.isolateSelection();
    expect([...(controller.getVisualPlan().focusIds ?? [])]).toEqual(ids);
    expect(ids).not.toEqual([42]);
    controller.applyVisualPlan({
      colors: [{ ids, color: [0, 1, 0, 1] }],
      label: "Nouveau filtre",
    });
    const next = controller.getVisualPlan();
    controller.clearSelectionIsolation();
    expect(controller.getVisualPlan()).toEqual(next);
    expect(controller.getSnapshot().selectionIsolationActive).toBe(false);
    controller.isolateSelection();
    controller.setIsolationContext(false, 0.3);
    expect(controller.getSnapshot().selectionIsolationActive).toBe(true);
    controller.clearSelectionIsolation();
    expect(controller.getSnapshot().visual.label).toBe("Nouveau filtre");
    controller.isolateSelection();
    controller.setActiveModel("model-a");
    expect(controller.getSnapshot().selectionIsolationActive).toBe(true);
    controller.applyVisualPlan(
      { ...next, label: "Filtres actualisés" },
      { preserveSelectionIsolation: true },
    );
    expect(controller.getSnapshot().selectionIsolationActive).toBe(true);
    controller.clearSelectionIsolation();
    expect(controller.getSnapshot().visual.mode).toBe("color");
    expect(controller.getSnapshot().visual.label).toBe("Filtres actualisés");
    controller.dispose();
  });

  it("accumulates hidden and colored classes while retaining isolation", async () => {
    const { calls, controller } = createHarness();
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "model.ifc",
      downloadUrl: "http://storage.local/model.ifc",
    });
    const framing = calls.fitToView;
    expect(controller.countBim({ ifcClasses: ["IfcWall", "IfcDoor"] })).toBe(2);
    controller.isolate({ ifcClasses: ["IfcWall", "IfcDoor"] });
    controller.color({ ifcClasses: ["IfcWall"] }, [1, 0, 0, 1]);
    controller.color({ ifcClasses: ["IfcDoor"] }, [0, 0, 1, 1]);
    controller.hide({ ifcClasses: ["IfcDoor"] });
    controller.hide({ ifcClasses: ["IfcWall"] });
    const plan = controller.getVisualPlan();
    expect(Array.from(plan.focusIds ?? [])).toEqual([42, 84]);
    expect(Array.from(plan.hiddenIds ?? [])).toEqual([84, 42]);
    expect(
      Array.from(plan.colors ?? []).map((group) => ({
        ids: Array.from(group.ids),
        color: group.color,
      })),
    ).toEqual([
      { ids: [42], color: [1, 0, 0, 1] },
      { ids: [84], color: [0, 0, 1, 1] },
    ]);
    expect(controller.getSnapshot().visual.mode).toBe("isolate");
    controller.setIsolationContext(false, 0.25);
    expect(controller.getSnapshot().visual.showContext).toBe(false);
    controller.resetVisuals();
    expect(controller.getSnapshot().visual.mode).toBe("all");
    expect(Array.from(controller.getVisualPlan().hiddenIds ?? [])).toEqual([]);
    expect(calls.rendererCreated).toBe(1);
    expect(calls.fitToView).toBe(framing);
    controller.dispose();
  });

  it("streams a point cloud into the same renderer and updates GPU settings live", async () => {
    const { calls, controller } = createHarness();
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "model.ifc",
      downloadUrl: "http://storage.local/model.ifc",
    });

    await controller.loadPointCloud({
      assetId: "point-cloud-id",
      fileName: "scan.las",
      source: {
        mode: "preview",
        downloadUrl: "http://storage.local/scan.las",
      },
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
    controller.fitToView();
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

  it("swaps COPC LOD frontiers without rebuilding or reframing", async () => {
    const { calls, controller } = createHarness();
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "model.ifc",
      downloadUrl: "http://storage.local/model.ifc",
    });

    await controller.loadPointCloud({
      assetId: "copc-id",
      fileName: "scan.laz",
      source: {
        mode: "copc",
        access: {
          copcUrl: "http://storage.local/cloud.copc.laz",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        refreshAccess: async () => {
          throw new Error("not needed");
        },
      },
      maxPointsInMemory: 2_000_000,
      transform: {
        position: [0, 0, 0],
        rotationDegrees: [-90, 0, 0],
        scale: [1, 1, 1],
      },
    });

    expect(controller.getSnapshot().pointClouds[0]).toMatchObject({
      source: "copc",
      phase: "streaming",
      pointCount: 1,
      residentNodeCount: 1,
    });
    controller.setPointCloudPointBudget(4_000_000);
    expect(controller.getSnapshot().pointClouds[0]).toMatchObject({
      phase: "ready",
      pointCount: 2,
      residentNodeCount: 2,
    });
    expect(calls.pointCloudsBegun).toBe(3);
    expect(calls.pointCloudsRemoved).toBe(1);
    expect(calls.rendererCreated).toBe(1);
    controller.fitToView();
    expect(calls.fitToView).toBe(1);
    controller.dispose();
  });

  it("hides and restores one point cloud without disturbing other layers or the camera", async () => {
    const { calls, controller } = createHarness();
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "model.ifc",
      downloadUrl: "http://storage.local/model.ifc",
    });

    const cloud = (assetId: string) => ({
      assetId,
      fileName: `${assetId}.laz`,
      source: {
        mode: "copc" as const,
        access: {
          copcUrl: "http://storage.local/cloud.copc.laz",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        refreshAccess: async () => {
          throw new Error("not needed");
        },
      },
      maxPointsInMemory: 2_000_000,
      transform: {
        position: [0, 0, 0] as [number, number, number],
        rotationDegrees: [-90, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
      },
    });

    await controller.loadPointCloud(cloud("scan-a"));
    await controller.loadPointCloud(cloud("scan-b"));
    expect(controller.getSnapshot().pointClouds).toHaveLength(2);

    controller.removePointCloud("scan-a");
    expect(
      controller.getSnapshot().pointClouds.map(({ assetId }) => assetId),
    ).toEqual(["scan-b"]);
    expect(calls.pointCloudsRemoved).toBe(1);

    await controller.loadPointCloud(cloud("scan-a"));
    expect(
      controller
        .getSnapshot()
        .pointClouds.map(({ assetId }) => assetId)
        .sort(),
    ).toEqual(["scan-a", "scan-b"]);
    expect(calls.pointCloudsBegun).toBe(3);
    expect(calls.rendererCreated).toBe(1);
    expect(calls.sceneCleared).toBe(0);
    expect(calls.fitToView).toBe(0);
    expect(calls.cameraPosesApplied).toBe(0);
    expect(controller.getSnapshot().models).toHaveLength(1);
    controller.dispose();
  });

  it("does not resurrect a point cloud hidden while renderer initialization is pending", async () => {
    let releaseInitialization!: () => void;
    const initialization = new Promise<void>((resolve) => {
      releaseInitialization = resolve;
    });
    const { calls, controller } = createHarness({
      rendererInit: () => initialization,
    });

    const loading = controller.loadPointCloud({
      assetId: "scan-a",
      fileName: "scan-a.laz",
      source: {
        mode: "preview",
        downloadUrl: "http://storage.local/scan-a.laz",
      },
      maxPointsInMemory: 2_000_000,
      transform: {
        position: [0, 0, 0],
        rotationDegrees: [-90, 0, 0],
        scale: [1, 1, 1],
      },
    });
    controller.removePointCloud("scan-a");
    releaseInitialization();
    await loading;

    expect(controller.getSnapshot().pointClouds).toEqual([]);
    expect(calls.pointCloudsBegun).toBe(0);
    controller.dispose();
  });

  it("shares single and additive selections across models without reframing", async () => {
    const { controller, calls, advanceFrame, getCameraPose } = createHarness();
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "a.ifc",
      downloadUrl: "http://storage.local/a.ifc",
    });
    await controller.loadIfc({
      assetId: "model-b",
      fileName: "b.ifc",
      downloadUrl: "http://storage.local/b.ifc",
    });
    const camera = getCameraPose();
    const framed = calls.fitToView;
    controller.selectModelEntity("model-a", 42);
    controller.selectModelEntity("model-b", 42, true);
    expect(controller.getSnapshot().selectedElements).toEqual([
      { assetId: "model-a", expressId: 42 },
      { assetId: "model-b", expressId: 42 },
    ]);
    advanceFrame();
    expect(calls.lastRenderOptions?.selectedIds?.size).toBe(2);
    expect(controller.getSnapshot().activeModelId).toBe("model-b");
    controller.selectModelEntity("model-b", 42, true);
    expect(controller.getSnapshot().selectedElements).toEqual([
      { assetId: "model-a", expressId: 42 },
    ]);
    expect(controller.getSnapshot().activeModelId).toBe("model-a");
    expect(controller.getSnapshot().selection?.expressId).toBe(42);
    controller.selectEntity(null, undefined, true);
    expect(controller.getSnapshot().selectedElements).toHaveLength(1);
    controller.selectModelEntity("model-b", 84);
    expect(controller.getSnapshot().selectedElements).toEqual([
      { assetId: "model-b", expressId: 84 },
    ]);
    advanceFrame();
    expect(calls.lastRenderOptions?.selectedIds?.size).toBe(1);
    expect(getCameraPose()).toEqual(camera);
    expect(calls.fitToView).toBe(framed);
    expect(calls.rendererCreated).toBe(1);
    controller.selectEntity(null);
    advanceFrame();
    expect(controller.getSnapshot().selectedElements).toEqual([]);
    expect(controller.getSnapshot().selection).toBeNull();
    expect(calls.lastRenderOptions?.selectedIds?.size).toBe(0);
    controller.dispose();
  });

  it("round-trips a BCF viewpoint without recreating or reframing the renderer", async () => {
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return {
            drawImage() {},
            getImageData() {
              return { data: new Uint8ClampedArray([1, 2, 3, 255]) };
            },
          };
        }
      },
    );
    vi.stubGlobal("createImageBitmap", async () => ({ close() {} }));
    const { calls, controller } = createHarness();
    await controller.loadIfc({
      assetId: "model-a",
      fileName: "model.ifc",
      downloadUrl: "http://storage.local/model.ifc",
    });
    controller.selectEntity(42);
    controller.selectEntity(84, undefined, true);
    controller.applyVisualPlan({
      focusIds: [42],
      showContext: false,
      colors: [{ ids: [84], color: [0.5, 0.1, 0.8, 1] }],
      label: "Capture BCF",
    });

    const capture = await controller.captureBcfViewpoint();
    vi.unstubAllGlobals();

    expect(capture.targetDistance).toBe(20);
    expect(capture.snapshot).toMatchObject({ type: "image/png" });
    expect(capture.data).toMatchObject({
      perspectiveCamera: { aspectRatio: 16 / 9 },
      components: {
        selection: [
          { ifcGuid: "3vB1mExampleGlobalId" },
          { ifcGuid: "0YvctA6Hn0pgmBdv0cPwH6" },
        ],
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
    expect(controller.getSnapshot().selectedElements).toHaveLength(2);
    expect(calls.cameraPosesApplied).toBeGreaterThanOrEqual(5);
    expect(calls.rendererCreated).toBe(1);
    controller.fitToView();
    expect(calls.fitToView).toBe(1);
    controller.dispose();
  });
});

it("routes measuring clicks without selecting BIM entities and releases its handler", async () => {
  const { controller, dispatch, calls } = createHarness();
  await controller.loadIfc({
    assetId: "measure",
    fileName: "measure.ifc",
    downloadUrl: "http://storage.local/measure.ifc",
  });
  const first = vi.fn();
  const second = vi.fn();
  const stopFirst = controller.onMeasurementPick(first);
  const stopSecond = controller.onMeasurementPick(second);
  stopFirst();
  const click = () => {
    dispatch("pointerdown", {
      type: "pointerdown",
      button: 0,
      clientX: 100,
      clientY: 120,
      pointerId: 1,
    });
    dispatch("pointerup", {
      type: "pointerup",
      button: 0,
      clientX: 100,
      clientY: 120,
      pointerId: 1,
    });
  };
  click();
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith(100, 120);
  expect(calls.pick).toBe(0);
  stopSecond();
  click();
  await Promise.resolve();
  expect(calls.pick).toBe(1);
  expect(calls.rendererCreated).toBe(1);
  controller.dispose();
});
