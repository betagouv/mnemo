export type PlanPoint = { x: number; y: number };
export type PlanTransform = PlanPoint & { scale: number };
export type PlanSegment = { start: PlanPoint; end: PlanPoint };

export function screenToPlan(point: PlanPoint, view: PlanTransform): PlanPoint {
  return {
    x: (point.x - view.x) / view.scale,
    y: (point.y - view.y) / view.scale,
  };
}

export function zoomPlan(
  view: PlanTransform,
  pointer: PlanPoint,
  factor: number,
): PlanTransform {
  const scale = Math.max(0.01, Math.min(100_000, view.scale * factor));
  const ratio = scale / view.scale;
  return {
    scale,
    x: pointer.x - (pointer.x - view.x) * ratio,
    y: pointer.y - (pointer.y - view.y) * ratio,
  };
}

export function planDistance(start: PlanPoint, end: PlanPoint) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function fitPlan(
  bounds: { min: PlanPoint; max: PlanPoint },
  width: number,
  height: number,
): PlanTransform {
  const scale = Math.min(
    Math.max(1, width - 64) / Math.max(0.01, bounds.max.x - bounds.min.x),
    Math.max(1, height - 64) / Math.max(0.01, bounds.max.y - bounds.min.y),
  );
  return {
    scale,
    x: width / 2 - ((bounds.min.x + bounds.max.x) / 2) * scale,
    y: height / 2 - ((bounds.min.y + bounds.max.y) / 2) * scale,
  };
}
