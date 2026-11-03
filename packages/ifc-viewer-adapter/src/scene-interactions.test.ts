import { Camera, type Renderer } from "@ifc-lite/renderer";
import { describe, expect, it } from "vitest";

import { SceneInteractions } from "./scene-interactions";

describe("SceneInteractions", () => {
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
