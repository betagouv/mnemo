import {
  planDistance,
  closestPointOnPlanSegment,
  type PlanPoint,
  type PlanSegment,
} from "./floor-plan-navigation";

import { PlanSpatialIndex } from "./floor-plan-spatial-index";

export type PlanSnap = { point: PlanPoint; kind: "vertex" | "edge" };

/** A bounding-volume tree bounds the per-pointer search to nearby geometry. */
export class PlanSnapIndex {
  private readonly index: PlanSpatialIndex<PlanSegment>;

  constructor(segments: PlanSegment[]) {
    this.index = new PlanSpatialIndex(segments, ({ start, end }) => ({
      minX: Math.min(start.x, end.x),
      minY: Math.min(start.y, end.y),
      maxX: Math.max(start.x, end.x),
      maxY: Math.max(start.y, end.y),
    }));
  }

  find(point: PlanPoint, pixelsPerMeter: number): PlanSnap | null {
    if (!(pixelsPerMeter > 0)) return null;
    const radius = 10 / pixelsPerMeter;
    let vertex: PlanPoint | null = null;
    let edge: PlanPoint | null = null;
    let vertexDistance = radius * 0.7;
    let edgeDistance = radius;
    this.index.forEach(
      {
        minX: point.x - radius,
        minY: point.y - radius,
        maxX: point.x + radius,
        maxY: point.y + radius,
      },
      (segment) => {
        for (const candidate of [segment.start, segment.end]) {
          const distance = planDistance(point, candidate);
          if (distance < vertexDistance) {
            vertex = candidate;
            vertexDistance = distance;
          }
        }
        const candidate = closestPointOnPlanSegment(point, segment);
        const distance = planDistance(point, candidate);
        if (distance < edgeDistance) {
          edge = candidate;
          edgeDistance = distance;
        }
      },
    );
    return vertex
      ? { point: vertex, kind: "vertex" }
      : edge
        ? { point: edge, kind: "edge" }
        : null;
  }
}
