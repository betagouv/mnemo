import type { FloorPlanDrawing } from "@mnemo/ifc-viewer-adapter";
import type { PlanPoint, PlanSegment } from "./floor-plan-navigation";
import type { PlanBounds } from "./floor-plan-spatial-index";
import { PlanSnapIndex } from "./floor-plan-snap";

type Polygon = FloorPlanDrawing["cutPolygons"][number];
export type PreparedFloorPlan = {
  polygons: { path: Path2D; source: Polygon; bounds: PlanBounds }[];
  lines: { source: FloorPlanDrawing["lines"][number]; bounds: PlanBounds }[];
  snapping: PlanSnapIndex;
};
const preparedPlans = new WeakMap<FloorPlanDrawing, PreparedFloorPlan>();

function pointBounds(points: readonly PlanPoint[]): PlanBounds {
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const point of points) {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
  }
  return bounds;
}

export function prepareFloorPlan(drawing: FloorPlanDrawing): PreparedFloorPlan {
  const cached = preparedPlans.get(drawing);
  if (cached) return cached;
  const segments: PlanSegment[] = [];
  const polygons: { path: Path2D; source: Polygon; bounds: PlanBounds }[] = [];
  for (const source of drawing.cutPolygons) {
    const path = new Path2D();
    for (const ring of [source.polygon.outer, ...source.polygon.holes]) {
      if (!ring.length) continue;
      path.moveTo(ring[0].x, ring[0].y);
      for (let i = 1; i < ring.length; i++) path.lineTo(ring[i].x, ring[i].y);
      path.closePath();
      for (let i = 0; i < ring.length; i++)
        segments.push({ start: ring[i], end: ring[(i + 1) % ring.length] });
    }
    polygons.push({ path, source, bounds: pointBounds(source.polygon.outer) });
  }
  const lines = drawing.lines
    .filter((source) => source.visibility !== "hidden")
    .map((source) => {
      segments.push(source.line);
      return {
        source,
        bounds: pointBounds([source.line.start, source.line.end]),
      };
    });
  const geometry = { polygons, lines, snapping: new PlanSnapIndex(segments) };
  preparedPlans.set(drawing, geometry);
  return geometry;
}
