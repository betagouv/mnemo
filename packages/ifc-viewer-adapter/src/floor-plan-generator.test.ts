import { floorPlanCutHeight } from "@mnemo/contracts/floor-plans";
import { generateFloorPlan, type Drawing2D } from "@ifc-lite/drawing-2d";
import type { MeshData } from "@ifc-lite/geometry";
import { describe, expect, it, vi } from "vitest";
import { FloorPlanGenerator } from "./floor-plan-generator";

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
function scene() {
  const pieces = [mesh(0, 3), mesh(20, 23)];
  const getMeshDataPieces = vi.fn(() => pieces);
  const model = {
    meshIds: new Set([1]),
    modelIndex: 0,
    sceneElevation: (elevation: number) => elevation,
    store: {},
    bimIndex: {
      catalog: {
        storeys: Array.from({ length: 5 }, (_, i) => ({
          expressId: i + 1,
          elevation: i * 0.1,
        })),
      },
    },
  };
  const context = {
    disposed: false,
    models: new Map([["asset", model]]),
    renderer: { getScene: () => ({ getMeshDataPieces }) },
    federation: { fromGlobalId: () => null },
  } as unknown as Parameters<FloorPlanGenerator["generate"]>[0];
  return { context, pieces, getMeshDataPieces };
}
const compute = () =>
  vi.fn((meshes: MeshData[], elevation: number) =>
    generateFloorPlan(meshes, elevation, { includeHiddenLines: false }),
  );

describe("floor plan lifecycle", () => {
  it("deduplicates requests, filters meshes and reuses completed plans", async () => {
    const { context, pieces, getMeshDataPieces } = scene();
    const run = compute();
    const generator = new FloorPlanGenerator(run);
    const first = generator.generate(context, "asset", 1);
    expect(generator.generate(context, "asset", 1)).toBe(first);
    const drawing = await first;
    expect(drawing.getElementExpressId(123)).toBe(123);
    vi.spyOn(context.federation, "fromGlobalId").mockReturnValue({
      modelId: "asset",
      expressId: 42,
    });
    expect(drawing.getElementExpressId(123)).toBe(42);
    expect(run.mock.calls[0][0]).toEqual([pieces[0]]);
    expect(run.mock.calls[0][1]).toBe(floorPlanCutHeight);
    expect(await generator.generate(context, "asset", 1)).toBe(drawing);
    expect(getMeshDataPieces).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    generator.clear();
    await generator.generate(context, "asset", 1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used plan after three cached levels", async () => {
    const { context } = scene();
    const run = compute();
    const generator = new FloorPlanGenerator(run);
    for (const id of [1, 2, 3, 1, 4, 1, 2])
      await generator.generate(context, "asset", id);
    expect(run).toHaveBeenCalledTimes(5);
  });

  it("regenerates when a model is replaced", async () => {
    const { context } = scene();
    const run = compute();
    const generator = new FloorPlanGenerator(run);
    await generator.generate(context, "asset", 1);
    const model = context.models.get("asset")!;
    const next = { ...context, models: new Map([["asset", { ...model }]]) };
    await generator.generate(next, "asset", 1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("cancels obsolete calculations and never caches late results", async () => {
    const { context } = scene();
    const signals: AbortSignal[] = [];
    let finish: ((drawing: Drawing2D) => void) | undefined;
    const run = vi.fn(
      (_meshes: MeshData[], _height: number, signal: AbortSignal) => {
        signals.push(signal);
        return new Promise<Drawing2D>((resolve) => {
          finish = resolve;
        });
      },
    );
    const generator = new FloorPlanGenerator(run);
    const first = generator.generate(context, "asset", 1);
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    generator.cancel();
    expect(signals[0].aborted).toBe(true);
    finish!(await generateFloorPlan([mesh(0, 3)], floorPlanCutHeight));
    await rejected;
    const second = generator.generate(context, "asset", 1);
    finish!(await generateFloorPlan([mesh(0, 3)], floorPlanCutHeight));
    await second;
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not retain oversized drawings in the cache", async () => {
    const { context } = scene();
    const base = await generateFloorPlan([mesh(0, 3)], floorPlanCutHeight);
    const drawing = { ...base, lines: Array(250_001).fill(base.lines[0]) };
    const run = vi.fn(async () => drawing);
    const generator = new FloorPlanGenerator(run);
    await generator.generate(context, "asset", 1);
    await generator.generate(context, "asset", 1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("leaves failures retryable", async () => {
    const { context } = scene();
    const run = compute().mockRejectedValueOnce(new Error("failed"));
    const generator = new FloorPlanGenerator(run);
    await expect(generator.generate(context, "asset", 1)).rejects.toThrow(
      "failed",
    );
    await generator.generate(context, "asset", 1);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
