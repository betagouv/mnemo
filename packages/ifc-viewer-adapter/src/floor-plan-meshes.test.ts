import type { MeshData } from "@ifc-lite/geometry";
import { describe, expect, it } from "vitest";
import { intersectsFloorPlan } from "./floor-plan-meshes";

function mesh(min: number, max: number, origin = 0): MeshData {
  return {
    expressId: 1,
    ifcType: "IfcWall",
    color: [1, 1, 1, 1],
    positions: new Float32Array([0, min, 0, 1, max, 0, 0, min, 1]),
    normals: new Float32Array(9),
    indices: new Uint32Array([0, 1, 2]),
    origin: [0, origin, 0],
  };
}

describe("floor plan vertical selection", () => {
  it("selects geometry between the floor and the cut", () => {
    expect(intersectsFloorPlan(mesh(0.1, 0.8), 1)).toBe(true);
    expect(intersectsFloorPlan(mesh(-1, -0.1), 1)).toBe(false);
    expect(intersectsFloorPlan(mesh(1.3, 2), 1)).toBe(false);
  });

  it("retains crossing elements regardless of their originating level", () => {
    expect(intersectsFloorPlan(mesh(-5, 5), 1)).toBe(true);
    expect(intersectsFloorPlan(mesh(-0.2, 0), 1)).toBe(true);
    expect(intersectsFloorPlan(mesh(1, 3), 1)).toBe(true);
  });

  it("accounts for per-mesh origins and negative cut elevations", () => {
    expect(intersectsFloorPlan(mesh(0, 1, 7), 8.2)).toBe(true);
    expect(intersectsFloorPlan(mesh(0, 1, 10), 8.2)).toBe(false);
    expect(intersectsFloorPlan(mesh(-3, -2), -1.8)).toBe(true);
    expect(intersectsFloorPlan(mesh(-5, -4), -1.8)).toBe(false);
  });

  it("allows one millimetre of rounding at both band boundaries", () => {
    expect(intersectsFloorPlan(mesh(-0.1, -0.0009), 1)).toBe(true);
    expect(intersectsFloorPlan(mesh(1.0009, 2), 1)).toBe(true);
    expect(intersectsFloorPlan(mesh(-0.1, -0.002), 1)).toBe(false);
    expect(intersectsFloorPlan(mesh(1.002, 2), 1)).toBe(false);
  });

  it("retains malformed bounds for the geometry processor to handle", () => {
    expect(intersectsFloorPlan(mesh(NaN, NaN), 20)).toBe(true);
    expect(intersectsFloorPlan(mesh(-Infinity, Infinity), 20)).toBe(true);
    expect(
      intersectsFloorPlan(
        { ...mesh(0, 1), positions: new Float32Array(0) },
        20,
      ),
    ).toBe(true);
  });
});
