import { afterEach, expect, it, vi } from "vitest";
import type { FloorPlanDrawing } from "@mnemo/ifc-viewer-adapter";
import { createFloorPlanStyleResolver } from "@mnemo/ifc-viewer-adapter";
import { prepareFloorPlan } from "./floor-plan-geometry";
import { FloorPlanSelection } from "./floor-plan-selection";

class TestPath {
  moveTo() {}
  lineTo() {}
  closePath() {}
}
afterEach(() => vi.unstubAllGlobals());

function setup() {
  vi.stubGlobal("Path2D", TestPath);
  const ring = (min: number, max: number) => [
    { x: min, y: min },
    { x: max, y: min },
    { x: max, y: max },
    { x: min, y: max },
  ];
  const drawing = {
    cutPolygons: [
      {
        entityId: 10042,
        ifcType: "IfcWall",
        polygon: { outer: ring(0, 10), holes: [ring(3, 7)] },
      },
    ],
    lines: [
      {
        entityId: 10084,
        ifcType: "IfcDoor",
        visibility: "visible",
        category: "projection",
        line: { start: { x: 12, y: 0 }, end: { x: 12, y: 10 } },
      },
      {
        entityId: 10099,
        ifcType: "IfcWall",
        visibility: "hidden",
        category: "projection",
        line: { start: { x: 20, y: 0 }, end: { x: 20, y: 10 } },
      },
    ],
    bounds: { min: { x: 0, y: 0 }, max: { x: 20, y: 10 } },
    getElementProperties: () => ({}),
    getElementExpressId: (id: number) => id - 10000,
  } as unknown as FloorPlanDrawing;
  return {
    selection: new FloorPlanSelection(drawing, prepareFloorPlan(drawing)),
    resolve: createFloorPlanStyleResolver(drawing, "default"),
  };
}

it("picks filled polygons and nearby edges with local IFC ids, preserving holes", () => {
  const { selection, resolve } = setup();
  expect(selection.pick({ x: 1, y: 1 }, 100, resolve)).toBe(42);
  expect(selection.pick({ x: 5, y: 5 }, 100, resolve)).toBeNull();
  expect(selection.pick({ x: 3.02, y: 5 }, 100, resolve)).toBe(42);
  expect(selection.pick({ x: 12.05, y: 5 }, 100, resolve)).toBe(84);
  expect(selection.pick({ x: 12.07, y: 5 }, 100, resolve)).toBeNull();
  expect(selection.pick({ x: 12.5, y: 5 }, 10, resolve)).toBe(84);
  expect(selection.pick({ x: 20, y: 5 }, 100, resolve)).toBeNull();
});

it("excludes styles that are hidden or transparent from picking and highlighting", () => {
  const { selection, resolve } = setup();
  const hidden = (source: Parameters<typeof resolve>[0]) => ({
    ...resolve(source),
    visible: false,
  });
  const transparent = (source: Parameters<typeof resolve>[0]) => ({
    ...resolve(source),
    opacity: 0,
  });
  expect(selection.pick({ x: 1, y: 1 }, 100, hidden)).toBeNull();
  expect(selection.pick({ x: 12, y: 5 }, 100, transparent)).toBeNull();
  const stroke = vi.fn();
  const fill = vi.fn();
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke,
    fill,
  } as unknown as CanvasRenderingContext2D;
  const view = { x: 10, y: 20, scale: 100 };
  selection.draw(context, [42, 84], view, 2, hidden, "#000091");
  expect(stroke).not.toHaveBeenCalled();
  expect(fill).not.toHaveBeenCalled();
  selection.draw(context, [42], view, 2, resolve, "#000091");
  expect(fill).toHaveBeenCalledWith(expect.any(TestPath), "evenodd");
  expect(stroke).toHaveBeenCalledTimes(1);
  expect(context.setTransform).toHaveBeenLastCalledWith(200, 0, 0, 200, 20, 40);
});
