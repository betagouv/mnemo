import { readFile } from "node:fs/promises";
import init from "@ifc-lite/wasm";
import type { MeshData } from "@ifc-lite/geometry";
import {
  createSectionConfig,
  mergeDrawingLines,
  outlineToProjectionLines,
} from "@ifc-lite/drawing-2d";
import { beforeAll, describe, expect, it } from "vitest";
import { extractFloorPlanOutline } from "./floor-plan-outline";
import { generateFloorPlanDrawing } from "./floor-plan-computation";

beforeAll(async () => {
  const bytes = await readFile(
    new URL(import.meta.resolve("@ifc-lite/wasm/ifc-lite_bg.wasm")),
  );
  await init({ module_or_path: bytes });
});

function box(id = 1): MeshData {
  return {
    expressId: id,
    ifcType: "IfcDuctSegment",
    color: [1, 1, 1, 1],
    positions: new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1,
    ]),
    indices: new Uint32Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2,
      3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]),
    normals: new Float32Array(24),
  };
}

function footprint(mesh: MeshData, elevation: number) {
  const plane = createSectionConfig("y", elevation).plane;
  const outline = extractFloorPlanOutline(mesh, "y", plane.flipped);
  return outline
    ? mergeDrawingLines(
        outlineToProjectionLines(
          outline,
          { entityId: mesh.expressId, modelIndex: 0, ifcType: mesh.ifcType! },
          plane,
          { below: 3, above: 3 },
        ),
      )
    : [];
}

describe("floor plan footprints", () => {
  it("returns the same boundary for both triangle windings", () => {
    const forward = box();
    const reversed = { ...forward, indices: forward.indices.slice() };
    for (let i = 0; i < reversed.indices.length; i += 3)
      [reversed.indices[i + 1], reversed.indices[i + 2]] = [
        reversed.indices[i + 2],
        reversed.indices[i + 1],
      ];
    const lines = footprint(forward, 1.2);
    expect(lines).toHaveLength(4);
    expect(footprint(reversed, 1.2)).toEqual(lines);
  });

  it("keeps placement offsets in double precision", () => {
    const mesh = box();
    mesh.origin = [100_000_000.123456, 50, 100_000_000.654321];
    const lines = footprint(mesh, 51.2);
    expect(lines).toHaveLength(4);
    const xs = lines.flatMap(({ line }) => [line.start.x, line.end.x]);
    expect(Math.min(...xs)).toBeCloseTo(mesh.origin[0], 7);
    expect(Math.max(...xs)).toBeCloseTo(mesh.origin[0] + 1, 7);
  });

  it("omits hidden overhead from the printable plan", async () => {
    const low = box(1);
    const high = { ...box(2), origin: [5, 2, 0] as [number, number, number] };
    const drawing = await generateFloorPlanDrawing([low, high], 1.2);
    expect(drawing.lines.some((line) => line.entityId === 1)).toBe(true);
    expect(drawing.lines.some((line) => line.entityId === 2)).toBe(false);
    expect(drawing.stats.hiddenLineCount).toBe(0);
    expect(drawing.bounds.max.x).toBeLessThanOrEqual(1);
  });

  it("projects many independent objects without retaining their triangle edges", async () => {
    const meshes = Array.from({ length: 500 }, (_, index) => ({
      ...box(index + 1),
      origin: [index * 2, 0, 0] as [number, number, number],
    }));
    const drawing = await generateFloorPlanDrawing(meshes, 1.2);
    expect(drawing.stats.totalTriangles).toBe(6000);
    expect(drawing.lines).toHaveLength(2000);
  });
  it("lets IFC-Lite exclude the overhead part of a mesh crossing the cut", async () => {
    const low = box();
    const high = box();
    for (let i = 0; i < high.positions.length; i += 3) {
      high.positions[i] += 3;
      high.positions[i + 1] += 2;
    }
    const mixed = {
      ...low,
      positions: new Float32Array([...low.positions, ...high.positions]),
      indices: new Uint32Array([
        ...low.indices,
        ...high.indices.map((index) => index + 8),
      ]),
      normals: new Float32Array(48),
    };
    const drawing = await generateFloorPlanDrawing([mixed], 1.2);
    expect(drawing.lines.length).toBeGreaterThan(0);
    expect(
      drawing.lines.every(({ line }) => line.start.x <= 1 && line.end.x <= 1),
    ).toBe(true);
    expect(drawing.bounds.max.x).toBeLessThanOrEqual(1);
  });

  it("keeps above-cut ramp geometry out of the plan at a non-f32 cut height", async () => {
    const elevation = 0.325;
    const ramp = {
      ...box(),
      positions: new Float32Array([0, 0, 0, 0, 0, 1, 2, 2, 0]),
      indices: new Uint32Array([0, 1, 2]),
      normals: new Float32Array(9),
    };
    const frame = { ...box(2), origin: [5, 0, 0] as [number, number, number] };
    const drawing = await generateFloorPlanDrawing([ramp, frame], elevation);
    const rampLines = drawing.lines.filter(
      (line) => line.entityId === ramp.expressId,
    );
    expect(rampLines.length).toBeGreaterThan(0);
    // Along this ramp x = y. Every retained contour must stay at x <= elevation.
    expect(
      rampLines.every(
        ({ line }) =>
          line.start.x <= elevation + 1e-6 && line.end.x <= elevation + 1e-6,
      ),
    ).toBe(true);
    const xs = rampLines.flatMap(({ line }) => [line.start.x, line.end.x]);
    expect(Math.max(...xs)).toBeCloseTo(elevation, 6);
  });

  it("ignores a dense overhead mesh without exhausting its outline budget", async () => {
    const low = box(1);
    const indices = new Uint32Array(50_001 * 3);
    for (let i = 0; i < indices.length; i++) indices[i] = i % 3;
    const overhead = {
      ...box(2),
      positions: new Float32Array([3, 2, 0, 4, 2, 0, 3, 2, 1]),
      indices,
      normals: new Float32Array(9),
    };
    // This mesh exceeds the WASM budget if the overhead band is calculated.
    expect(() => extractFloorPlanOutline(overhead, "y", false)).toThrow(
      /50.*000 triangles projetés/,
    );
    const expected = await generateFloorPlanDrawing([low], 1.2);
    const actual = await generateFloorPlanDrawing([low, overhead], 1.2);
    expect(actual.lines).toEqual(expected.lines);
    expect(actual.cutPolygons).toEqual(expected.cutPolygons);
    expect(actual.bounds).toEqual(expected.bounds);
  });

  it("fails explicitly when IFC-Lite cannot compute a complete outline", async () => {
    const indices = new Uint32Array(50_001 * 3);
    for (let i = 0; i < indices.length; i++) indices[i] = i % 3;
    const mesh = {
      ...box(123),
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
      indices,
      normals: new Float32Array(9),
    };
    await expect(generateFloorPlanDrawing([mesh], 1.2)).rejects.toThrow(
      /Le maillage IFC #123 dépasse la limite de 50.*000 triangles projetés/,
    );
  });
});
