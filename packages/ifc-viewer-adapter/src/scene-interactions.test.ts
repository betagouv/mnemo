import { Camera, type Renderer } from "@ifc-lite/renderer";
import { describe, expect, it, vi } from "vitest";

import { SceneInteractions } from "./scene-interactions";

type Point = { x: number; y: number; z: number };

function createOrbitHarness() {
  const listeners = new Map<string, EventListener>();
  const camera = new Camera();
  camera.setPosition(10, 8, 12);
  camera.setTarget(0, 0, 0);
  const setOrbitCenter = vi.spyOn(camera, "setOrbitCenter");
  let resolvePick!: (point: Point | null) => void;
  let rejectPick!: (error: Error) => void;
  const pick = new Promise<Point | null>((resolve, reject) => {
    resolvePick = resolve;
    rejectPick = reject;
  });
  const findOrbitCenter = vi.fn(() => pick);
  const onPick = vi.fn();
  const canvas = {
    style: {},
    addEventListener: (name: string, listener: EventListener) =>
      listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
    setPointerCapture: () => undefined,
    hasPointerCapture: () => false,
    getBoundingClientRect: () => ({
      left: 10,
      top: 20,
      width: 800,
      height: 600,
    }),
  } as unknown as HTMLCanvasElement;
  const interactions = new SceneInteractions({
    canvas,
    renderer: {
      getCamera: () => camera,
      requestRender: () => undefined,
    } as unknown as Renderer,
    onPick,
    findOrbitCenter,
  });
  interactions.attach();
  return {
    camera,
    interactions,
    findOrbitCenter,
    setOrbitCenter,
    onPick,
    resolvePick,
    rejectPick,
    dispatch(type: string, event: object = {}) {
      listeners.get(type)?.({
        type,
        button: 0,
        pointerId: 1,
        clientX: 110,
        clientY: 140,
        preventDefault: () => undefined,
        ...event,
      } as unknown as Event);
    },
  };
}

describe("SceneInteractions", () => {
  it.each(["perspective", "orthographic"] as const)(
    "orbits the clicked surface in %s without moving the camera while picking",
    async (projection) => {
      const {
        camera,
        dispatch,
        resolvePick,
        findOrbitCenter,
        onPick,
        interactions,
      } = createOrbitHarness();
      camera.setProjectionMode(projection);
      const pivot = { x: 4, y: 0, z: 3 };
      const start = { ...camera.getPosition() };
      const reference = new Camera();
      reference.setPosition(start.x, start.y, start.z);
      reference.setTarget(0, 0, 0);
      reference.setProjectionMode(projection);
      reference.setOrbitCenter(pivot);
      reference.orbit(35, 25, false);

      dispatch("pointerdown");
      dispatch("pointermove", { clientX: 130, clientY: 150 });
      dispatch("pointermove", { clientX: 145, clientY: 165 });
      expect(camera.getPosition()).toEqual(start);
      expect(findOrbitCenter).toHaveBeenCalledExactlyOnceWith(100, 120);
      resolvePick(pivot);
      await vi.waitFor(() =>
        expect(camera.getPosition().x).toBeCloseTo(reference.getPosition().x),
      );
      expect(camera.getPosition().y).toBeCloseTo(reference.getPosition().y);
      expect(camera.getPosition().z).toBeCloseTo(reference.getPosition().z);
      expect(camera.getTarget()).toEqual(reference.getTarget());
      dispatch("pointerup");
      expect(onPick).not.toHaveBeenCalled();
      interactions.detach();
    },
  );

  it("keeps ordinary clicks and pointer jitter on the selection path", () => {
    const { dispatch, findOrbitCenter, onPick, interactions } =
      createOrbitHarness();
    dispatch("pointerdown");
    dispatch("pointermove", { clientX: 111, clientY: 141 });
    dispatch("pointerup", { clientX: 111, clientY: 141, ctrlKey: true });
    expect(findOrbitCenter).not.toHaveBeenCalled();
    expect(onPick).toHaveBeenCalledExactlyOnceWith(101, 121, true);
    interactions.detach();
  });

  it.each([{ button: 1 }, { button: 2 }, { shiftKey: true }])(
    "pans without changing the orbit center for %o",
    (modifiers) => {
      const { dispatch, findOrbitCenter, interactions, camera } =
        createOrbitHarness();
      const start = { ...camera.getPosition() };
      dispatch("pointerdown", modifiers);
      dispatch("pointermove", { clientX: 145 });
      expect(camera.getPosition()).not.toEqual(start);
      expect(findOrbitCenter).not.toHaveBeenCalled();
      interactions.detach();
    },
  );

  it("finishes a short drag around the picked point after pointer release", async () => {
    const { dispatch, resolvePick, setOrbitCenter, camera, interactions } =
      createOrbitHarness();
    const start = { ...camera.getPosition() };
    dispatch("pointerdown");
    dispatch("pointermove", { clientX: 145 });
    dispatch("pointerup");
    resolvePick({ x: 4, y: 0, z: 3 });
    await vi.waitFor(() => expect(setOrbitCenter).toHaveBeenCalledOnce());
    expect(camera.getPosition()).not.toEqual(start);
    interactions.detach();
  });

  it.each(["cancel", "detach", "wheel", "new gesture", "camera command"])(
    "ignores a delayed pick after %s",
    async (action) => {
      const { dispatch, resolvePick, setOrbitCenter, camera, interactions } =
        createOrbitHarness();
      dispatch("pointerdown");
      dispatch("pointermove", { clientX: 145 });
      if (action === "cancel") dispatch("pointercancel");
      if (action === "detach") interactions.detach();
      if (action === "wheel") dispatch("wheel", { deltaY: -120 });
      if (action === "new gesture") {
        dispatch("pointerup");
        dispatch("pointerdown", { pointerId: 2 });
      }
      if (action === "camera command") camera.setPosition(20, 30, 40);
      const position = { ...camera.getPosition() };
      resolvePick({ x: 4, y: 0, z: 3 });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(setOrbitCenter).not.toHaveBeenCalled();
      expect(camera.getPosition()).toEqual(position);
      interactions.detach();
    },
  );

  it.each(["miss", "failure"])(
    "keeps navigation usable after a pick %s",
    async (result) => {
      const {
        dispatch,
        resolvePick,
        rejectPick,
        setOrbitCenter,
        camera,
        interactions,
      } = createOrbitHarness();
      const start = { ...camera.getPosition() };
      dispatch("pointerdown");
      dispatch("pointermove", { clientX: 145 });
      if (result === "miss") resolvePick(null);
      else rejectPick(new Error("Device lost"));
      await vi.waitFor(() => expect(camera.getPosition()).not.toEqual(start));
      expect(setOrbitCenter).not.toHaveBeenCalled();
      interactions.detach();
    },
  );

  it("passes Ctrl and Meta clicks to picking as additive selections", () => {
    const listeners = new Map<string, EventListener>();
    const picks: { x: number; y: number; additive: boolean }[] = [];
    const canvas = {
      style: {},
      addEventListener: (name: string, listener: EventListener) =>
        listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
      setPointerCapture: () => undefined,
      hasPointerCapture: () => false,
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
    } as unknown as HTMLCanvasElement;
    const interactions = new SceneInteractions({
      canvas,
      renderer: { requestRender: () => undefined } as unknown as Renderer,
      onPick: (x, y, additive) => picks.push({ x, y, additive }),
    });
    interactions.attach();
    for (const [ctrlKey, metaKey] of [
      [false, false],
      [true, false],
      [false, true],
    ]) {
      const event = {
        button: 0,
        pointerId: 1,
        clientX: 100,
        clientY: 120,
        ctrlKey,
        metaKey,
      };
      listeners.get("pointerdown")?.(event as PointerEvent);
      listeners.get("pointerup")?.({
        ...event,
        type: "pointerup",
      } as PointerEvent);
    }
    expect(picks).toEqual(
      [false, true, true].map((additive) => ({ x: 90, y: 100, additive })),
    );
    interactions.detach();
  });
  it.each(["perspective", "orthographic"] as const)(
    "anchors %s wheel zoom in CSS pixels regardless of drawing-buffer scale",
    (projection) => {
      function zoomAt(pixelRatio: number, x: number, y: number) {
        const listeners = new Map<string, (event: Event) => void>();
        const camera = new Camera();
        camera.setPosition(0, 0, 20);
        camera.setTarget(0, 0, 0);
        camera.setAspect(800 / 600);
        camera.setProjectionMode(projection);
        const canvas = {
          width: 800 * pixelRatio,
          height: 600 * pixelRatio,
          addEventListener: (
            name: string,
            listener: EventListenerOrEventListenerObject,
          ) => {
            if (typeof listener === "function") listeners.set(name, listener);
          },
          removeEventListener: (name: string) => listeners.delete(name),
          getBoundingClientRect: () => ({
            left: 320,
            top: 80,
            width: 800,
            height: 600,
          }),
        } as unknown as HTMLCanvasElement;
        const renderer = {
          getCamera: () => camera,
          requestRender: () => undefined,
        } as unknown as Renderer;
        const interactions = new SceneInteractions({
          canvas,
          renderer,
          onPick: () => undefined,
        });
        interactions.attach();
        listeners.get("wheel")?.({
          clientX: 320 + x,
          clientY: 80 + y,
          deltaY: -120,
          shiftKey: false,
          preventDefault: () => undefined,
        } as WheelEvent);
        interactions.detach();
        return { ...camera.getTarget() };
      }
      for (const [x, y] of [
        [400, 300],
        [200, 150],
        [600, 450],
      ]) {
        const reference = zoomAt(1, x, y);
        for (const ratio of [1.25, 1.5, 2]) {
          const target = zoomAt(ratio, x, y);
          expect(target.x).toBeCloseTo(reference.x);
          expect(target.y).toBeCloseTo(reference.y);
          expect(target.z).toBeCloseTo(reference.z);
        }
      }
      const center = zoomAt(2, 400, 300);
      expect(center.x).toBeCloseTo(0);
      expect(center.y).toBeCloseTo(0);
      expect(zoomAt(2, 200, 150).x).toBeLessThan(0);
      expect(zoomAt(2, 600, 450).x).toBeGreaterThan(0);
    },
  );

  it("uses the visible orthographic zoom to scale a Shift-drag with IFC-Lite's real camera", () => {
    const listeners = new Map<string, (event: Event) => void>();
    const camera = new Camera();
    camera.setPosition(0, 0, 20);
    camera.setTarget(0, 0, 0);
    camera.setProjectionMode("orthographic");
    const canvas = {
      style: {},
      addEventListener: (
        name: string,
        listener: EventListenerOrEventListenerObject,
      ) => {
        if (typeof listener === "function") listeners.set(name, listener);
      },
      removeEventListener: (name: string) => listeners.delete(name),
      setPointerCapture: () => undefined,
      hasPointerCapture: () => false,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as unknown as HTMLCanvasElement;
    const renderer = {
      getCamera: () => camera,
      requestRender: () => undefined,
    } as unknown as Renderer;
    const interactions = new SceneInteractions({
      canvas,
      renderer,
      onPick: () => undefined,
    });
    interactions.attach();

    const drag = (pointerId: number) => {
      listeners.get("pointerdown")?.({
        button: 0,
        shiftKey: true,
        clientX: 100,
        clientY: 100,
        pointerId,
      } as PointerEvent);
      listeners.get("pointermove")?.({
        clientX: 140,
        clientY: 100,
        pointerId,
      } as PointerEvent);
      listeners.get("pointerup")?.({
        button: 0,
        pointerId,
        type: "pointerup",
      } as PointerEvent);
    };

    const start = { ...camera.getPosition() };
    drag(1);
    const afterFirstDrag = { ...camera.getPosition() };
    const firstDistance = Math.hypot(
      afterFirstDrag.x - start.x,
      afterFirstDrag.y - start.y,
      afterFirstDrag.z - start.z,
    );
    expect(firstDistance).toBeGreaterThan(0);

    camera.setOrthoSize(camera.getOrthoSize() / 4);
    drag(2);
    const afterZoomedDrag = camera.getPosition();
    const zoomedDistance = Math.hypot(
      afterZoomedDrag.x - afterFirstDrag.x,
      afterZoomedDrag.y - afterFirstDrag.y,
      afterZoomedDrag.z - afterFirstDrag.z,
    );
    expect(zoomedDistance).toBeCloseTo(firstDistance / 4);
    interactions.detach();
  });
});
