import type {
  GeometryProcessor,
  MeshData,
  StreamingGeometryEvent,
} from "@ifc-lite/geometry";
import type { IfcDataStore, IfcParser } from "@ifc-lite/parser";
import type { Renderer } from "@ifc-lite/renderer";
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
    sceneCleared: 0,
    batchesAdded: 0,
    fitToView: 0,
    orbit: 0,
    pan: 0,
    zoom: 0,
    pick: 0,
    orbitCenter: null as { x: number; y: number; z: number } | null,
    rendererDestroyed: 0,
    geometryDisposed: 0,
  };
  let renderRequested = false;
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
  };
  const renderer = {
    init: async () => {
      calls.rendererInitialized += 1;
    },
    onDeviceLost: () => () => undefined,
    resize: () => undefined,
    getScene: () => scene,
    getCamera: () => camera,
    getGPUDevice: () => null,
    getPipeline: () => null,
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
});
