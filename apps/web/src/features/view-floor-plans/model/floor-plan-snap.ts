import {
  planDistance,
  type PlanPoint,
  type PlanSegment,
} from "./floor-plan-navigation";

type Node = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  segments?: PlanSegment[];
  left?: Node;
  right?: Node;
};
export type PlanSnap = { point: PlanPoint; kind: "vertex" | "edge" };

/** A bounding-volume tree bounds the per-pointer search to nearby geometry. */
export class PlanSnapIndex {
  private root: Node | null;

  constructor(segments: PlanSegment[]) {
    const build = (items: PlanSegment[]): Node => {
      const node: Node = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      };
      for (const { start, end } of items) {
        node.minX = Math.min(node.minX, start.x, end.x);
        node.minY = Math.min(node.minY, start.y, end.y);
        node.maxX = Math.max(node.maxX, start.x, end.x);
        node.maxY = Math.max(node.maxY, start.y, end.y);
      }
      if (items.length <= 12) node.segments = items;
      else {
        const axis = node.maxX - node.minX > node.maxY - node.minY ? "x" : "y";
        items.sort(
          (a, b) => a.start[axis] + a.end[axis] - b.start[axis] - b.end[axis],
        );
        const middle = Math.floor(items.length / 2);
        node.left = build(items.slice(0, middle));
        node.right = build(items.slice(middle));
      }
      return node;
    };
    const valid = segments.filter(({ start, end }) =>
      [start.x, start.y, end.x, end.y].every(Number.isFinite),
    );
    this.root = valid.length ? build(valid) : null;
  }

  find(point: PlanPoint, pixelsPerMeter: number): PlanSnap | null {
    if (!(pixelsPerMeter > 0)) return null;
    const radius = 10 / pixelsPerMeter;
    let vertex: PlanPoint | null = null;
    let edge: PlanPoint | null = null;
    let vertexDistance = radius * 0.7;
    let edgeDistance = radius;
    const visit = (node: Node) => {
      if (
        point.x < node.minX - radius ||
        point.x > node.maxX + radius ||
        point.y < node.minY - radius ||
        point.y > node.maxY + radius
      )
        return;
      for (const segment of node.segments ?? []) {
        for (const candidate of [segment.start, segment.end]) {
          const distance = planDistance(point, candidate);
          if (distance < vertexDistance) {
            vertex = candidate;
            vertexDistance = distance;
          }
        }
        const dx = segment.end.x - segment.start.x;
        const dy = segment.end.y - segment.start.y;
        const lengthSquared = dx * dx + dy * dy;
        const t =
          lengthSquared > 0
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((point.x - segment.start.x) * dx +
                    (point.y - segment.start.y) * dy) /
                    lengthSquared,
                ),
              )
            : 0;
        const candidate = {
          x: segment.start.x + t * dx,
          y: segment.start.y + t * dy,
        };
        const distance = planDistance(point, candidate);
        if (distance < edgeDistance) {
          edge = candidate;
          edgeDistance = distance;
        }
      }
      if (node.left) visit(node.left);
      if (node.right) visit(node.right);
    };
    if (this.root) visit(this.root);
    return vertex
      ? { point: vertex, kind: "vertex" }
      : edge
        ? { point: edge, kind: "edge" }
        : null;
  }
}
