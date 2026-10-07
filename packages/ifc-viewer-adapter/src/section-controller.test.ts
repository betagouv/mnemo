import type { Renderer } from "@ifc-lite/renderer";
import { describe, expect, it, vi } from "vitest";

import { SectionController } from "./section-controller";

function createHarness() {
  const requestRender = vi.fn();
  const onChange = vi.fn();
  const bounds = {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 10, y: 20, z: 30 },
  };
  let hit: {
    intersection: {
      point: { x: number; y: number; z: number };
      normal: { x: number; y: number; z: number };
    };
  } | null = null;
  const raycastScene = vi.fn(() => hit);
  const pick = vi.fn(
    async () =>
      null as { worldXYZ?: { x: number; y: number; z: number } } | null,
  );
  const renderer = {
    getCamera: () => ({
      getSceneBounds: () => bounds,
      getPosition: () => ({ x: 0, y: 10, z: 10 }),
    }),
    getScene: () => ({ getBounds: () => bounds }),
    raycastScene,
    pick,
    requestRender,
  } as unknown as Renderer;
  const controller = new SectionController(renderer, onChange);

  return {
    controller,
    onChange,
    raycastScene,
    pick,
    requestRender,
    setHit(
      point: { x: number; y: number; z: number },
      normal = { x: 0, y: 1, z: 0 },
    ) {
      hit = { intersection: { point, normal } };
    },
  };
}

describe("SectionController", () => {
  it("applies, flips, hides and resets an axis plane", () => {
    const { controller, onChange, requestRender } = createHarness();

    expect(controller.renderOptions).toEqual({});
    controller.setAxis("front");
    controller.setPosition(37);
    controller.setFlipped(true);

    expect(controller.renderOptions.sectionPlane).toMatchObject({
      axis: "front",
      position: 37,
      flipped: true,
      showCap: true,
      enabled: true,
    });
    expect(controller.snapshot.active).toBe("plane");
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(requestRender).toHaveBeenCalledTimes(3);

    controller.hide();
    expect(controller.renderOptions).toEqual({});
    controller.showPlane();
    expect(controller.renderOptions.sectionPlane?.position).toBe(37);
    controller.reset();
    expect(controller.snapshot.active).toBeNull();
    expect(controller.snapshot.plane.position).toBe(50);
  });

  it("defines a face plane from the IFC-Lite surface normal", () => {
    const { controller, setHit } = createHarness();
    controller.startPick("face");
    setHit({ x: 3, y: 4, z: 5 }, { x: 0, y: 2, z: 0 });

    expect(controller.pick(100, 200)).toBe(true);
    expect(controller.snapshot.pickMode).toBeNull();
    expect(controller.snapshot.plane.source).toBe("face");
    expect(controller.renderOptions.sectionPlane).toMatchObject({
      normal: [0, 1, 0],
      enabled: true,
    });
    expect(controller.renderOptions.sectionPlane?.distance).toBeLessThan(4);
    expect(controller.snapshot.plane.pickedAt).toEqual([3, 4, 5]);
    controller.setCustomDistance(5);
    expect(controller.renderOptions.sectionPlane?.distance).toBe(5);
  });

  it("orients a picked face normal toward the camera", () => {
    const { controller, setHit } = createHarness();
    controller.startPick("face");
    setHit({ x: 3, y: 4, z: 5 }, { x: 0, y: -1, z: 0 });
    controller.pick(100, 200);
    expect(controller.renderOptions.sectionPlane?.normal).toEqual([0, 1, 0]);
  });

  it("defines a vertical plane from two picked points and restores the prior cut on cancel", () => {
    const { controller, setHit } = createHarness();
    controller.setAxis("down");
    controller.startPick("two-point");
    expect(controller.renderOptions).toEqual({});
    setHit({ x: 1, y: 2, z: 3 });
    controller.pick(10, 20);
    expect(controller.snapshot.draftPoint).not.toBeNull();
    expect(controller.snapshot.draftPoint).toEqual([1, 2, 3]);
    controller.cancelPick();
    expect(controller.snapshot.active).toBe("plane");
    expect(controller.snapshot.draftPoint).toBeNull();

    controller.startPick("two-point");
    controller.pick(10, 20);
    setHit({ x: 5, y: 7, z: 3 });
    controller.pick(30, 40);
    expect(controller.renderOptions.sectionPlane).toMatchObject({
      normal: [0, 0, -1],
      distance: -3,
    });
    expect(controller.snapshot.draftPoint).toBeNull();
    expect(controller.snapshot.trace).toEqual({
      start: [1, 2, 3],
      end: [5, 7, 3],
    });
  });

  it("fits and edits a clipping box without affecting the camera", () => {
    const { controller } = createHarness();
    expect(controller.showBox()).toBe(true);
    expect(controller.renderOptions.clipBox).toEqual({
      min: [0.8, 1.6, 2.4],
      max: [9.2, 18.4, 27.6],
      enabled: true,
    });
    controller.moveBoxFace(0, "min", 4);
    expect(controller.renderOptions.clipBox?.min[0]).toBe(4);
    controller.hide();
    expect(controller.renderOptions).toEqual({});
    controller.showBox();
    expect(controller.renderOptions.clipBox?.min[0]).toBe(4);
  });

  it("uses GPU world coordinates for two-point cutting when CPU triangles were released", async () => {
    const { controller, pick, raycastScene } = createHarness();
    pick
      .mockResolvedValueOnce({ worldXYZ: { x: 1, y: 2, z: 3 } })
      .mockResolvedValueOnce({ worldXYZ: { x: 5, y: 4, z: 3 } });

    controller.startPick("two-point");
    expect(controller.pick(10, 20)).toBe(true);
    await vi.waitFor(() =>
      expect(controller.snapshot.draftPoint).not.toBeNull(),
    );
    controller.pick(30, 40);
    await vi.waitFor(() => expect(controller.snapshot.active).toBe("plane"));

    expect(raycastScene).toHaveBeenCalledTimes(2);
    expect(pick).toHaveBeenCalledTimes(2);
    expect(controller.renderOptions.sectionPlane).toMatchObject({
      normal: [0, 0, -1],
      distance: -3,
    });
  });

  it("does not apply a late GPU hit after cancelling a pick", async () => {
    const { controller, pick } = createHarness();
    let resolvePick: (value: {
      worldXYZ: { x: number; y: number; z: number };
    }) => void = () => undefined;
    pick.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePick = resolve;
        }),
    );

    controller.startPick("two-point");
    controller.pick(10, 20);
    controller.cancelPick();
    resolvePick({ worldXYZ: { x: 1, y: 2, z: 3 } });
    await Promise.resolve();

    expect(controller.snapshot.pickMode).toBeNull();
    expect(controller.snapshot.draftPoint).toBeNull();
    expect(controller.snapshot.active).toBeNull();
  });

  it("explains why face picking is unavailable after CPU geometry release", async () => {
    const { controller, pick } = createHarness();
    pick.mockResolvedValueOnce({ worldXYZ: { x: 1, y: 2, z: 3 } });

    controller.startPick("face");
    controller.pick(10, 20);
    await vi.waitFor(() =>
      expect(controller.snapshot.message).toContain("deux points"),
    );
    expect(controller.snapshot.pickMode).toBe("face");
    expect(controller.snapshot.active).toBeNull();
  });
});
