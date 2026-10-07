import type { IfcSectionSnapshot } from "@mnemo/ifc-viewer-adapter";

type ScreenPoint = { x: number; y: number };
type WorldPoint = { x: number; y: number; z: number };
export type SectionBounds = { min: WorldPoint; max: WorldPoint };

const axisNames = { down: "y", front: "z", side: "x" } as const;

export function sectionPlanePosition(
  plane: IfcSectionSnapshot["plane"],
  bounds: SectionBounds | null,
) {
  if (plane.source === "axis") {
    if (!bounds) return null;
    const axis = axisNames[plane.axis];
    const span = bounds.max[axis] - bounds.min[axis];
    if (!Number.isFinite(span) || span <= 0) return null;
    const foot = {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
    };
    const distance = bounds.min[axis] + (plane.position / 100) * span;
    foot[axis] = distance;
    const normal = { x: 0, y: 0, z: 0 };
    normal[axis] = 1;
    return { foot, normal, distance, span };
  }

  const { normal, pickedAt, distance } = plane;
  if (!normal || !pickedAt || distance === null) return null;
  const [nx, ny, nz] = normal;
  const [px, py, pz] = pickedAt;
  const offset = distance - (px * nx + py * ny + pz * nz);
  return {
    foot: { x: px + offset * nx, y: py + offset * ny, z: pz + offset * nz },
    normal: { x: nx, y: ny, z: nz },
    distance,
    span: null,
  };
}

export function sectionPlaneCorners(
  plane: IfcSectionSnapshot["plane"],
  bounds: SectionBounds | null,
) {
  const position = sectionPlanePosition(plane, bounds);
  if (!position || !bounds) return null;
  const { foot, normal } = position;
  if (plane.source === "axis") {
    const axis = axisNames[plane.axis];
    const others = (["x", "y", "z"] as const).filter((name) => name !== axis);
    return (
      [
        ["min", "min"],
        ["max", "min"],
        ["max", "max"],
        ["min", "max"],
      ] as const
    ).map(([first, second]) => ({
      ...foot,
      [others[0]]: bounds[first][others[0]],
      [others[1]]: bounds[second][others[1]],
    }));
  }

  const reference =
    Math.abs(normal.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const tangent = {
    x: reference.y * normal.z - reference.z * normal.y,
    y: reference.z * normal.x - reference.x * normal.z,
    z: reference.x * normal.y - reference.y * normal.x,
  };
  const tangentLength = Math.hypot(tangent.x, tangent.y, tangent.z);
  if (tangentLength < 1e-6) return null;
  const u = {
    x: tangent.x / tangentLength,
    y: tangent.y / tangentLength,
    z: tangent.z / tangentLength,
  };
  const v = {
    x: normal.y * u.z - normal.z * u.y,
    y: normal.z * u.x - normal.x * u.z,
    z: normal.x * u.y - normal.y * u.x,
  };
  const radius =
    Math.hypot(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z,
    ) * 0.4;
  return (
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const
  ).map(([a, b]) => ({
    x: foot.x + radius * (a * u.x + b * v.x),
    y: foot.y + radius * (a * u.y + b * v.y),
    z: foot.z + radius * (a * u.z + b * v.z),
  }));
}

export function projectSectionGizmo(
  plane: IfcSectionSnapshot["plane"],
  bounds: SectionBounds | null,
  project: (point: WorldPoint) => ScreenPoint | null,
) {
  const position = sectionPlanePosition(plane, bounds);
  if (!position) return null;
  const { foot, normal } = position;
  const tip = {
    x: foot.x + normal.x,
    y: foot.y + normal.y,
    z: foot.z + normal.z,
  };
  if (![...Object.values(foot), ...Object.values(tip)].every(Number.isFinite)) {
    return null;
  }

  const footScreen = project(foot);
  const tipScreen = project(tip);
  if (!footScreen || !tipScreen) return null;

  const dx = tipScreen.x - footScreen.x;
  const dy = tipScreen.y - footScreen.y;
  const pixelsPerMeter = Math.hypot(dx, dy);
  if (!Number.isFinite(pixelsPerMeter)) return null;

  return {
    foot: footScreen,
    distance: position.distance,
    span: position.span,
    angle: Math.atan2(dy, dx),
    screenNormal:
      pixelsPerMeter > 1e-3
        ? { x: dx / pixelsPerMeter, y: dy / pixelsPerMeter }
        : null,
    pixelsPerMeter,
  };
}

export function draggedSectionDistance(
  startDistance: number,
  delta: ScreenPoint,
  screenNormal: ScreenPoint,
  pixelsPerMeter: number,
) {
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter < 1e-3) return null;
  const along = delta.x * screenNormal.x + delta.y * screenNormal.y;
  const distance = startDistance + along / pixelsPerMeter;
  return Number.isFinite(distance) ? distance : null;
}
