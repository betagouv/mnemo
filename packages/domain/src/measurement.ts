export type Point3 = { x: number; y: number; z: number };
export type MeasurementKind = "distance" | "surface";

export function distanceBetween(a: Point3, b: Point3) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

type Point2 = Pick<Point3, "x" | "y">;

function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2) {
  const cross = (start: Point2, end: Point2, point: Point2) =>
    (end.x - start.x) * (point.y - start.y) -
    (end.y - start.y) * (point.x - start.x);
  const straddlesAB = cross(a, b, c) * cross(a, b, d) <= 0;
  const straddlesCD = cross(c, d, a) * cross(c, d, b) <= 0;
  const overlapsX =
    Math.max(a.x, b.x) >= Math.min(c.x, d.x) &&
    Math.max(c.x, d.x) >= Math.min(a.x, b.x);
  const overlapsY =
    Math.max(a.y, b.y) >= Math.min(c.y, d.y) &&
    Math.max(c.y, d.y) >= Math.min(a.y, b.y);
  return straddlesAB && straddlesCD && overlapsX && overlapsY;
}

/** Local differences preserve precision for georeferenced IFC coordinates. */
export function surfaceArea(
  points: readonly Point3[],
): { value: number } | { error: string } {
  if (points.length < 3) return { error: "Placez au moins trois points." };
  const origin = points[0]!;
  const local = points.map((point) => ({
    x: point.x - origin.x,
    y: point.y - origin.y,
    z: point.z - origin.z,
  }));
  const normal = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < local.length; i++) {
    const a = local[i]!;
    const b = local[(i + 1) % local.length]!;
    normal.x += a.y * b.z - a.z * b.y;
    normal.y += a.z * b.x - a.x * b.z;
    normal.z += a.x * b.y - a.y * b.x;
  }
  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (length < 1e-8) return { error: "Le contour doit délimiter une surface." };
  const unit = {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length,
  };
  const span = Math.max(
    ...local.map((point) => Math.hypot(point.x, point.y, point.z)),
  );
  if (
    local.some(
      (point) =>
        Math.abs(point.x * unit.x + point.y * unit.y + point.z * unit.z) >
        Math.max(0.002, span * 0.0001),
    )
  ) {
    return {
      error:
        "Les points doivent appartenir au même plan. Retirez le dernier point pour corriger le contour.",
    };
  }
  // Drop the dominant normal axis for stable segment intersection checks.
  const axes =
    Math.abs(unit.z) >= Math.max(Math.abs(unit.x), Math.abs(unit.y))
      ? (["x", "y"] as const)
      : Math.abs(unit.y) >= Math.abs(unit.x)
        ? (["x", "z"] as const)
        : (["y", "z"] as const);
  const flat = local.map((point) => ({ x: point[axes[0]], y: point[axes[1]] }));
  for (let i = 0; i < flat.length; i++) {
    const nextI = (i + 1) % flat.length;
    if (distanceBetween(points[i]!, points[nextI]!) < 1e-6)
      return { error: "Deux points du contour sont confondus." };
    for (let j = i + 1; j < flat.length; j++) {
      const nextJ = (j + 1) % flat.length;
      if (j === nextI || nextJ === i) continue;
      if (segmentsIntersect(flat[i]!, flat[nextI]!, flat[j]!, flat[nextJ]!)) {
        return {
          error:
            "Le contour se croise. Retirez le dernier point pour le corriger.",
        };
      }
    }
  }
  return { value: length / 2 };
}

export function formatMeasurement(value: number, kind: MeasurementKind) {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} ${kind === "surface" ? "m²" : "m"}`;
}
