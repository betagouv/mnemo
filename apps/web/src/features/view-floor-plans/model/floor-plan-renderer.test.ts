import { afterEach, expect, it, vi } from "vitest";
import type { FloorPlanDrawing } from "@mnemo/ifc-viewer-adapter";
import {
  drawFloorPlan,
  prepareFloorPlan,
  styleFloorPlan,
} from "./floor-plan-renderer";

class TestPath {
  moveTo() {}
  lineTo() {}
  closePath() {}
}
afterEach(() => vi.unstubAllGlobals());

it("reuses prepared paths and only draws spatial groups in the viewport", () => {
  vi.stubGlobal("Path2D", TestPath);
  const drawing = {
    cutPolygons: [],
    lines: [10, 10000].map((x, entityId) => ({
      line: { start: { x, y: 10 }, end: { x: x + 10, y: 10 } },
      category: "cut",
      visibility: "visible",
      ifcType: "IfcWall",
      entityId,
    })),
    bounds: { min: { x: 10, y: 10 }, max: { x: 10010, y: 10 } },
    getElementProperties: () => ({}),
  } as unknown as FloorPlanDrawing;
  const geometry = prepareFloorPlan(drawing);
  expect(prepareFloorPlan(drawing)).toBe(geometry);
  const styled = styleFloorPlan(geometry, drawing, "default");
  expect(styled.paths).toHaveLength(2);
  const stroke = vi.fn();
  const context = {
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    stroke,
  } as unknown as CanvasRenderingContext2D;
  drawFloorPlan(context, styled, { x: 0, y: 0, scale: 1 }, 100, 100, 1);
  expect(stroke).toHaveBeenCalledTimes(1);
  expect(stroke).toHaveBeenLastCalledWith(styled.paths[0].path);
  stroke.mockClear();
  drawFloorPlan(context, styled, { x: -9990, y: 0, scale: 1 }, 100, 100, 1);
  expect(stroke).toHaveBeenCalledTimes(1);
  expect(stroke).toHaveBeenLastCalledWith(styled.paths[1].path);
});
