import type { MeasurementPoint } from "@mnemo/ifc-viewer-adapter";
import type {
  MeasurementKind,
  Point3,
  SceneMeasurement,
} from "./measurement-geometry";
import type { MeasurementViewer } from "./viewer-target";

export type MeasurementTarget = {
  point: Point3;
  kind:
    | MeasurementPoint["kind"]
    | "measurement"
    | "axis"
    | "perpendicular"
    | "plane";
  guide?: Point3;
};

const subtract = (a: Point3, b: Point3): Point3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const length = (point: Point3) => Math.hypot(point.x, point.y, point.z);
const dot = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z;
const addScaled = (a: Point3, b: Point3, scale: number): Point3 => ({
  x: a.x + b.x * scale,
  y: a.y + b.y * scale,
  z: a.z + b.z * scale,
});
const axes: Point3[] = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
];

function contourNormal(points: readonly Point3[]) {
  const origin = points[0];
  if (!origin) return null;
  for (let i = 2; i < points.length; i++) {
    const a = subtract(points[i - 1]!, origin);
    const b = subtract(points[i]!, origin);
    const cross = {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
    const length = Math.hypot(cross.x, cross.y, cross.z);
    if (length > 1e-8)
      return addScaled({ x: 0, y: 0, z: 0 }, cross, 1 / length);
  }
  return null;
}

/** Resolve priorities in CSS pixels, so zoom and display density preserve the same capture area. */
export function snapMeasurement(
  viewer: MeasurementViewer,
  x: number,
  y: number,
  magnetic: boolean,
  mode: MeasurementKind,
  draft: readonly Point3[],
  measurements: readonly SceneMeasurement[],
): MeasurementTarget | null {
  const screenDistance = (point: Point3) => {
    const screen = viewer.projectWorldPoints([point])[0];
    return screen ? Math.hypot(screen.x - x, screen.y - y) : Infinity;
  };
  if (magnetic) {
    const anchors = [...draft, ...measurements.flatMap((item) => item.points)];
    let nearest: Point3 | null = null;
    let distance = 12;
    for (const point of anchors) {
      const candidate = screenDistance(point);
      if (candidate < distance) {
        nearest = point;
        distance = candidate;
      }
    }
    if (nearest) return { point: nearest, kind: "measurement" };
  }
  const hit = viewer.pickMeasurementPoint(x, y, magnetic);
  if (!magnetic) return hit;
  // A stale vendor edge lock must never attract a point outside the capture circle.
  const geometry =
    hit && hit.kind !== "surface" && screenDistance(hit.point) > 12
      ? viewer.pickMeasurementPoint(x, y, false)
      : hit;
  const origin = draft[0];
  const normal = mode === "surface" ? contourNormal(draft) : null;
  let base: MeasurementTarget | null = geometry;
  if (origin && normal) {
    const ray = viewer.getMeasurementRay(x, y);
    const denominator = ray ? dot(ray.direction, normal) : 0;
    if (ray && Math.abs(denominator) > 1e-6) {
      const t = dot(subtract(origin, ray.origin), normal) / denominator;
      if (t >= 0)
        base = {
          point: addScaled(ray.origin, ray.direction, t),
          kind: "plane",
        };
    }
    // Preserve exact vertices/edges only when they lie on the contour plane.
    if (
      geometry &&
      Math.abs(dot(subtract(geometry.point, origin), normal)) < 1e-5
    )
      base = geometry;
  }
  if (!base) return null;
  if (base.kind === "vertex") return base;
  const start = draft.at(-1);
  if (!start) return base;
  const basePoint = base.point;
  const projected = viewer.projectWorldPoints([
    basePoint,
    ...axes.map((axis) => addScaled(basePoint, axis, 1)),
  ]);
  const center = projected[0];
  if (!center) return base;
  const pixelsPerMetre = Math.max(
    ...projected
      .slice(1)
      .map((point) =>
        point ? Math.hypot(point.x - center.x, point.y - center.y) : 0,
      ),
  );
  if (pixelsPerMetre < 1e-8) return base;
  const tolerance = 8 / pixelsPerMetre;
  const delta = subtract(base.point, start);
  const candidates: MeasurementTarget[] = [];
  for (const axis of axes) {
    if (normal && Math.abs(dot(axis, normal)) > 1e-6) continue;
    const point = addScaled(start, axis, dot(delta, axis));
    candidates.push({ point, kind: "axis", guide: start });
  }
  let previous = draft.length >= 2 ? draft[draft.length - 2] : undefined;
  if (!previous) {
    for (const measurement of [...measurements].reverse()) {
      const index = measurement.points.findIndex(
        (point) => length(subtract(point, start)) < 1e-6,
      );
      if (index < 0) continue;
      previous = measurement.points[index > 0 ? index - 1 : 1];
      if (previous) break;
    }
  }
  if (previous) {
    const direction = subtract(start, previous);
    const lengthSquared = dot(direction, direction);
    if (lengthSquared > 1e-12)
      candidates.unshift({
        point: addScaled(
          base.point,
          direction,
          -dot(delta, direction) / lengthSquared,
        ),
        kind: "perpendicular",
        guide: start,
      });
  }
  // Before a surface has three points, suggest principal planes through its first point.
  if (mode === "surface" && !normal && origin) {
    for (const axis of axes)
      candidates.push({
        point: addScaled(
          base.point,
          axis,
          -dot(subtract(base.point, origin), axis),
        ),
        kind: "plane",
        guide: start,
      });
  }
  let best = base;
  let bestDistance = 8;
  for (const candidate of candidates) {
    const correction = subtract(candidate.point, base.point);
    if (candidate.kind === "plane" && length(correction) < 1e-8) continue;
    if (length(correction) > tolerance) continue;
    // Ignore a zero-length axis aligned with the camera's viewing direction.
    if (
      candidate.kind !== "plane" &&
      length(subtract(candidate.point, start)) < 1e-6
    )
      continue;
    const distance = screenDistance(candidate.point);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
