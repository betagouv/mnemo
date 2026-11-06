import { describe, expect, it } from "vitest";
import {
  fitPlan,
  planDistance,
  screenToPlan,
  zoomPlan,
} from "./floor-plan-navigation";
import { PlanSnapIndex } from "./floor-plan-snap";

describe("floor plan navigation", () => {
  it("keeps the drawing point under the pointer through repeated zoom and pan", () => {
    const pointer = { x: 135, y: 70 };
    let view = { x: -25, y: 10, scale: 4 };
    const point = screenToPlan(pointer, view);
    for (let i = 0; i < 100; i++) view = zoomPlan(view, pointer, 1.1);
    expect(screenToPlan(pointer, view).x).toBeCloseTo(point.x);
    expect(screenToPlan(pointer, view).y).toBeCloseTo(point.y);
  });
  it("fits off-origin bounds while preserving metre distances", () => {
    const view = fitPlan(
      { min: { x: 100, y: -50 }, max: { x: 120, y: -40 } },
      800,
      600,
    );
    expect(screenToPlan({ x: 400, y: 300 }, view)).toEqual({ x: 110, y: -45 });
    expect(planDistance({ x: 100, y: -50 }, { x: 103, y: -46 })).toBe(5);
  });
});

describe("floor plan snapping", () => {
  const index = new PlanSnapIndex([
    { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
  ]);
  it("prioritizes the nearest endpoint and projects onto the segment interior", () => {
    expect(index.find({ x: 0.04, y: 0.03 }, 100)).toEqual({
      point: { x: 0, y: 0 },
      kind: "vertex",
    });
    expect(index.find({ x: 5, y: 0.05 }, 100)).toEqual({
      point: { x: 5, y: 0 },
      kind: "edge",
    });
  });
  it("keeps the catch radius at ten screen pixels across zoom levels", () => {
    expect(index.find({ x: 5, y: 0.11 }, 100)).toBeNull();
    expect(index.find({ x: 5, y: 0.11 }, 10)?.kind).toBe("edge");
    expect(index.find({ x: 5, y: 1.01 }, 10)).toBeNull();
  });
  it("searches a large drawing and handles degenerate and invalid geometry", () => {
    const segments = Array.from({ length: 50_000 }, (_, i) => ({
      start: { x: i * 2, y: 0 },
      end: { x: i * 2 + 1, y: 0 },
    }));
    const large = new PlanSnapIndex([
      ...segments,
      { start: { x: NaN, y: 0 }, end: { x: 0, y: 0 } },
    ]);
    expect(large.find({ x: 80000.5, y: 0.01 }, 100)?.point).toEqual({
      x: 80000.5,
      y: 0,
    });
    expect(
      new PlanSnapIndex([{ start: { x: 1, y: 2 }, end: { x: 1, y: 2 } }]).find(
        { x: 1, y: 2 },
        100,
      )?.kind,
    ).toBe("vertex");
    expect(new PlanSnapIndex([]).find({ x: 1, y: 2 }, 100)).toBeNull();
  });
});
