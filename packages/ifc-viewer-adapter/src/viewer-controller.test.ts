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

import { createIfcBimIndex } from "./bim-index";
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
    batchesAdded: 0,
    streamingFinalized: 0,
    meshIds: [] as number[][],
    bimIndexIds: [] as number[][],
    fitToView: 0,
    presetViews: [] as { view: string; bounds: object }[],
    orbit: 0,
    pan: 0,
    panDeltas: [] as { x: number; y: number }[],
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
    pick: async () => {
      calls.pick += 1;
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
    controller.fitToView();
    expect(calls.fitToView).toBe(1);
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
    controller.fitToView();
    expect(calls.fitToView).toBe(1);
    controller.dispose();
  });
});
