import type { SceneMeasurement } from "./measurement-types";
import { describe, expect, it, vi } from "vitest";
import { snapMeasurement } from "./measurement-snapping";
import type { MeasurementViewer } from "./viewer-target";
import type { Point3 } from "@mnemo/domain/measurement";

const start = { x: 0, y: 0, z: 0 };
function viewer(point: Point3, zoom = 100) {
  return {
    measurementToProject: (point) => point,
    measurementFromProject: (point) => point,
    projectWorldPoints: (points) =>
      points.map((p) => ({ x: p.x * zoom, y: p.y * zoom })),
    pickMeasurementPoint: vi.fn(() => ({ point, kind: "surface" as const })),
    getMeasurementRay: (x, y) => ({
      origin: { x: x / zoom, y: y / zoom, z: 10 },
      direction: { x: 0, y: 0, z: -1 },
    }),
    onMeasurementPick: vi.fn(),
  } satisfies MeasurementViewer;
}

describe("measurement snapping", () => {
  it("prioritizes existing measurement points over geometry within 12 CSS pixels", () => {
    const v = viewer({ x: 1.05, y: 1, z: 0 });
    const measurement: SceneMeasurement = {
      id: "a",
      kind: "distance",
      points: [start, { x: 1, y: 1, z: 0 }],
      value: Math.sqrt(2),
    };
    expect(
      snapMeasurement(v, 105, 100, true, "distance", [], [measurement]),
    ).toMatchObject({ kind: "measurement", point: { x: 1, y: 1, z: 0 } });
    expect(v.pickMeasurementPoint).not.toHaveBeenCalled();
  });
  it("uses screen distance at each zoom rather than a fixed world distance", () => {
    const point = { x: 2, y: 0.05, z: 0 };
    expect(
      snapMeasurement(
        viewer(point, 100),
        200,
        5,
        true,
        "distance",
        [start],
        [],
      ),
    ).toMatchObject({ kind: "axis", point: { x: 2, y: 0, z: 0 } });
    expect(
      snapMeasurement(
        viewer(point, 1000),
        2000,
        50,
        true,
        "distance",
        [start],
        [],
      ),
    ).toMatchObject({ kind: "surface", point });
  });
  it("projects the rest of a contour onto its established plane, including empty space", () => {
    const v = viewer({ x: 2, y: 2, z: 3 });
    v.pickMeasurementPoint.mockReturnValueOnce(null as never);
    expect(
      snapMeasurement(
        v,
        200,
        200,
        true,
        "surface",
        [start, { x: 4, y: 0, z: 0 }, { x: 4, y: 4, z: 0 }],
        [],
      ),
    ).toMatchObject({ point: { x: 2, y: 2, z: 0 } });
  });
  it("suggests a perpendicular to the previous segment on a rotated contour", () => {
    const point = { x: 0.02, y: 2, z: 0 };
    expect(
      snapMeasurement(
        viewer(point),
        2,
        200,
        true,
        "surface",
        [start, { x: 1, y: 1, z: 0 }],
        [],
      ),
    ).toMatchObject({
      kind: "perpendicular",
      point: { x: expect.closeTo(0.01, 9), y: expect.closeTo(1.99, 9), z: 0 },
    });
  });
  it("disabling magnetism preserves the exact surface hit", () => {
    const point = { x: 2, y: 0.05, z: 0 };
    expect(
      snapMeasurement(viewer(point), 200, 5, false, "distance", [start], []),
    ).toEqual({ point, kind: "surface" });
  });
});
