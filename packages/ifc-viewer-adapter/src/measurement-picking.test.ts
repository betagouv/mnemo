import type { Renderer } from "@ifc-lite/renderer";
import { describe, expect, it, vi } from "vitest";
import { MeasurementPicking } from "./measurement-picking";

describe("MeasurementPicking", () => {
  it("reuses IFC-Lite snapping and edge locks with visible-geometry filters", () => {
    const edge = { v0: { x: 0, y: 0, z: 0 }, v1: { x: 4, y: 0, z: 0 } };
    const raycastSceneMagnetic = vi.fn().mockReturnValue({
      snapTarget: { type: "vertex", position: edge.v0 },
      intersection: { point: { x: 0.1, y: 0, z: 0 } },
      edgeLock: {
        shouldLock: true,
        shouldRelease: false,
        edge,
        meshExpressId: 42,
      },
    });
    const picker = new MeasurementPicking({
      raycastSceneMagnetic,
      getCamera: () => ({ getProjectionMode: () => "perspective" }),
    } as unknown as Renderer);
    const visibility = { hiddenIds: new Set([1]), isolatedIds: new Set([42]) };
    expect(picker.pick(123, 456, true, visibility)).toEqual({
      point: edge.v0,
      kind: "vertex",
    });
    picker.pick(124, 456, true, visibility);
    expect(raycastSceneMagnetic).toHaveBeenLastCalledWith(
      124,
      456,
      { edge, meshExpressId: 42, lockStrength: 1 },
      expect.objectContaining({
        ...visibility,
        snapOptions: expect.objectContaining({ screenSnapRadius: 12 }),
      }),
    );
    expect(picker.pick(125, 456, false, visibility)).toEqual({
      point: { x: 0.1, y: 0, z: 0 },
      kind: "surface",
    });
    expect(raycastSceneMagnetic.mock.lastCall?.[2]).toEqual({
      edge: null,
      meshExpressId: null,
      lockStrength: 0,
    });
    expect(raycastSceneMagnetic.mock.lastCall?.[3].snapOptions).toMatchObject({
      snapToVertices: false,
      snapToEdges: false,
      snapToPointClouds: false,
    });
  });
  it("handles a cursor in empty space", () => {
    const picker = new MeasurementPicking({
      getCamera: () => ({ getProjectionMode: () => "perspective" }),
      raycastSceneMagnetic: () => ({
        snapTarget: null,
        intersection: null,
        edgeLock: { shouldLock: false, shouldRelease: true },
      }),
    } as unknown as Renderer);
    expect(
      picker.pick(0, 0, true, { hiddenIds: new Set(), isolatedIds: null }),
    ).toBeNull();
  });
  it("scales the vendor radius with orthographic zoom", () => {
    let size = 10;
    const raycastSceneMagnetic = vi.fn().mockReturnValue({
      snapTarget: null,
      intersection: null,
      edgeLock: { shouldRelease: true },
    });
    const picker = new MeasurementPicking({
      raycastSceneMagnetic,
      getCamera: () => ({
        getProjectionMode: () => "orthographic",
        getOrthoSize: () => size,
        getDistance: () => 100,
        getFOV: () => Math.PI / 2,
      }),
    } as unknown as Renderer);
    const visibility = { hiddenIds: new Set<number>(), isolatedIds: null };
    picker.pick(10, 20, true, visibility);
    expect(
      raycastSceneMagnetic.mock.lastCall?.[3].snapOptions.screenSnapRadius,
    ).toBeCloseTo(1.2);
    size = 1;
    picker.pick(10, 20, true, visibility);
    expect(
      raycastSceneMagnetic.mock.lastCall?.[3].snapOptions.screenSnapRadius,
    ).toBeCloseTo(0.12);
  });
});
