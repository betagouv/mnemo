import { describe, expect, it } from "vitest";
import { PlanSpatialIndex } from "./floor-plan-spatial-index";
import { PlanSnapIndex } from "./floor-plan-snap";

describe("plan spatial queries", () => {
  it("returns only paths intersecting the viewport, including crossing paths", () => {
    const items = Array.from({ length: 10_000 }, (_, id) => ({
      id,
      minX: id * 10,
      maxX: id * 10 + 5,
      minY: 0,
      maxY: 5,
    }));
    const crossing = { id: -1, minX: -100, maxX: 100, minY: 2, maxY: 3 };
    const index = new PlanSpatialIndex([...items, crossing], (item) => item);
    const visible: number[] = [];
    index.forEach({ minX: 20, maxX: 25, minY: 0, maxY: 5 }, (item) =>
      visible.push(item.id),
    );
    expect(visible.sort()).toEqual([-1, 2]);
    const outside: number[] = [];
    index.forEach({ minX: 20, maxX: 25, minY: 10, maxY: 15 }, (item) =>
      outside.push(item.id),
    );
    expect(outside).toEqual([]);
  });

  it("retains segment snapping and pixel-sized tolerance at high zoom", () => {
    const index = new PlanSnapIndex([
      { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { start: { x: NaN, y: 0 }, end: { x: 10, y: 0 } },
    ]);
    expect(index.find({ x: 0.02, y: 0.02 }, 100)?.kind).toBe("vertex");
    expect(index.find({ x: 5, y: 0.05 }, 100)?.kind).toBe("edge");
    expect(index.find({ x: 5, y: 0.11 }, 100)).toBeNull();
    expect(index.find({ x: 5, y: 0 }, 0)).toBeNull();
  });
});
