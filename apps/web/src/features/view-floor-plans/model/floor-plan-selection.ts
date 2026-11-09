import type {
  FloorPlanDrawing,
  FloorPlanStyle,
} from "@mnemo/ifc-viewer-adapter";
import type { PreparedFloorPlan } from "./floor-plan-geometry";
import {
  closestPointOnPlanSegment,
  planDistance,
  type PlanPoint,
  type PlanTransform,
} from "./floor-plan-navigation";
import { PlanSpatialIndex, type PlanBounds } from "./floor-plan-spatial-index";

type Source =
  FloorPlanDrawing["lines"][number] | FloorPlanDrawing["cutPolygons"][number];
type Entry = {
  source: Source;
  bounds: PlanBounds;
  expressId: number;
  order: number;
  path?: Path2D;
};
type ResolveStyle = (source: Source, weight?: number) => FloorPlanStyle;

function segmentDistance(point: PlanPoint, start: PlanPoint, end: PlanPoint) {
  return planDistance(point, closestPointOnPlanSegment(point, { start, end }));
}

function insideRing(point: PlanPoint, ring: readonly PlanPoint[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

/** Pick exact vector geometry through a spatial index, independently of raster density. */
export class FloorPlanSelection {
  private readonly index: PlanSpatialIndex<Entry>;
  private readonly byEntity = new Map<number, Entry[]>();

  constructor(drawing: FloorPlanDrawing, geometry: PreparedFloorPlan) {
    const entries: Entry[] = [
      ...geometry.polygons.map(({ source, path, bounds }) => ({
        source,
        path,
        bounds,
      })),
      ...geometry.lines,
    ].map((entry, order) => ({
      ...entry,
      order,
      expressId: drawing.getElementExpressId(entry.source.entityId),
    }));
    for (const entry of entries) {
      const group = this.byEntity.get(entry.expressId) ?? [];
      group.push(entry);
      this.byEntity.set(entry.expressId, group);
    }
    this.index = new PlanSpatialIndex(entries, (entry) => entry.bounds);
  }

  pick(point: PlanPoint, scale: number, resolve: ResolveStyle): number | null {
    const radius = 6 / scale;
    const best = {
      id: null as number | null,
      distance: Infinity,
      drawOrder: -Infinity,
      order: -1,
    };
    this.index.forEach(
      {
        minX: point.x - radius,
        minY: point.y - radius,
        maxX: point.x + radius,
        maxY: point.y + radius,
      },
      (entry) => {
        const { source } = entry;
        const style = resolve(
          source,
          "line" in source && source.category !== "cut" ? 0.2 : 0.4,
        );
        if (!style.visible || style.opacity <= 0) return;
        let distance = Infinity;
        if ("line" in source)
          distance = segmentDistance(point, source.line.start, source.line.end);
        else {
          const { outer, holes } = source.polygon;
          if (
            insideRing(point, outer) &&
            !holes.some((ring) => insideRing(point, ring))
          )
            distance = radius;
          for (const ring of [outer, ...holes])
            for (let i = 0; i < ring.length; i++)
              distance = Math.min(
                distance,
                segmentDistance(point, ring[i], ring[(i + 1) % ring.length]),
              );
        }
        if (
          distance <= radius &&
          (distance < best.distance ||
            (distance === best.distance &&
              (style.drawOrder > best.drawOrder ||
                (style.drawOrder === best.drawOrder &&
                  entry.order > best.order))))
        ) {
          best.id = entry.expressId;
          best.distance = distance;
          best.drawOrder = style.drawOrder;
          best.order = entry.order;
        }
      },
    );
    return best.id;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    selected: readonly number[],
    view: PlanTransform,
    dpr: number,
    resolve: ResolveStyle,
    color: string,
  ) {
    ctx.save();
    ctx.setTransform(
      dpr * view.scale,
      0,
      0,
      dpr * view.scale,
      dpr * view.x,
      dpr * view.y,
    );
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3 / view.scale;
    ctx.setLineDash([]);
    for (const id of selected)
      for (const entry of this.byEntity.get(id) ?? []) {
        const style = resolve(entry.source);
        if (!style.visible || style.opacity <= 0) continue;
        if (entry.path) {
          ctx.globalAlpha = 0.2;
          ctx.fill(entry.path, "evenodd");
          ctx.globalAlpha = 1;
          ctx.stroke(entry.path);
        } else if ("line" in entry.source) {
          ctx.beginPath();
          ctx.moveTo(entry.source.line.start.x, entry.source.line.start.y);
          ctx.lineTo(entry.source.line.end.x, entry.source.line.end.y);
          ctx.stroke();
        }
      }
    ctx.restore();
  }
}
