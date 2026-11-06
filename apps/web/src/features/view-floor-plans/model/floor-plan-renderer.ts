import type { FloorPlanRule } from "@mnemo/contracts/floor-plans";
import {
  createFloorPlanStyleResolver,
  floorPlanHatches,
  type FloorPlanDrawing,
  type FloorPlanPresetId,
  type FloorPlanStyle,
} from "@mnemo/ifc-viewer-adapter";
import {
  planDistance,
  type PlanPoint,
  type PlanSegment,
  type PlanTransform,
} from "./floor-plan-navigation";
import { PlanSpatialIndex, type PlanBounds } from "./floor-plan-spatial-index";
import { PlanSnapIndex, type PlanSnap } from "./floor-plan-snap";

type Polygon = FloorPlanDrawing["cutPolygons"][number];
type Geometry = {
  polygons: { path: Path2D; source: Polygon; bounds: PlanBounds }[];
  lines: FloorPlanDrawing["lines"];
  snapping: PlanSnapIndex;
};
const preparedPlans = new WeakMap<FloorPlanDrawing, Geometry>();
type StyledPath = {
  bounds: PlanBounds;
  path: Path2D;
  style: FloorPlanStyle;
  fill?: boolean;
  hatch?: Path2D;
};

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

export function prepareFloorPlan(drawing: FloorPlanDrawing): Geometry {
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
  const lines = drawing.lines.filter((item) => item.visibility !== "hidden");
  for (const item of lines) segments.push(item.line);
  const geometry = { polygons, lines, snapping: new PlanSnapIndex(segments) };
  preparedPlans.set(drawing, geometry);
  return geometry;
}

/** Resolve styles and hatch paths on preset changes, outside navigation frames. */
export function styleFloorPlan(
  geometry: Geometry,
  drawing: FloorPlanDrawing,
  preset: FloorPlanPresetId,
  rules: readonly FloorPlanRule[] = [],
) {
  const resolve = createFloorPlanStyleResolver(drawing, preset, rules);
  const paths: StyledPath[] = geometry.polygons.map(
    ({ path, source, bounds }) => {
      const style = resolve(source);
      const hatch = new Path2D();
      if (style.visible)
        for (const { line } of floorPlanHatches(source, style)) {
          hatch.moveTo(line.start.x, line.start.y);
          hatch.lineTo(line.end.x, line.end.y);
        }
      return { path, style, hatch, fill: true, bounds };
    },
  );
  const groups = new Map<string, StyledPath>();
  const tileSize = Math.max(
    1,
    Math.max(
      drawing.bounds.max.x - drawing.bounds.min.x,
      drawing.bounds.max.y - drawing.bounds.min.y,
    ) / 32,
  );
  for (const source of geometry.lines) {
    const style = resolve(source, source.category === "cut" ? 0.4 : 0.2);
    const { start, end } = source.line;
    const tileX = Math.floor((start.x + end.x) / 2 / tileSize);
    const tileY = Math.floor((start.y + end.y) / 2 / tileSize);
    const key = `${tileX}/${tileY}/${JSON.stringify(style)}`;
    let group = groups.get(key);
    if (!group) {
      group = { path: new Path2D(), style, bounds: pointBounds([start, end]) };
      groups.set(key, group);
    }
    group.bounds.minX = Math.min(group.bounds.minX, start.x, end.x);
    group.bounds.minY = Math.min(group.bounds.minY, start.y, end.y);
    group.bounds.maxX = Math.max(group.bounds.maxX, start.x, end.x);
    group.bounds.maxY = Math.max(group.bounds.maxY, start.y, end.y);
    group.path.moveTo(source.line.start.x, source.line.start.y);
    group.path.lineTo(source.line.end.x, source.line.end.y);
  }
  paths.push(...groups.values());
  paths.sort((a, b) => a.style.drawOrder - b.style.drawOrder);
  const ordered = paths.map((path, order) => ({ ...path, order }));
  return {
    paths: ordered,
    index: new PlanSpatialIndex(ordered, (path) => path.bounds),
    maxStroke: paths.reduce(
      (max, { style }) =>
        Math.max(max, style.lineWeight * 4, style.hatchLineWeight * 4),
      1,
    ),
  };
}

export function drawFloorPlan(
  ctx: CanvasRenderingContext2D,
  drawing: ReturnType<typeof styleFloorPlan>,
  view: PlanTransform,
  width: number,
  height: number,
  dpr: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);
  // Include stroke joins outside the viewport before culling whole paths.
  const margin = (drawing.maxStroke * 5) / view.scale;
  const visible: typeof drawing.paths = [];
  drawing.index.forEach(
    {
      minX: -view.x / view.scale - margin,
      minY: -view.y / view.scale - margin,
      maxX: (width - view.x) / view.scale + margin,
      maxY: (height - view.y) / view.scale + margin,
    },
    (path) => visible.push(path),
  );
  visible.sort((a, b) => a.order - b.order);
  for (const { path, style, fill, hatch } of visible) {
    if (!style.visible) continue;
    ctx.globalAlpha = style.opacity;
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = Math.max(0.5, style.lineWeight * 4) / view.scale;
    ctx.lineCap = style.lineCap;
    ctx.lineJoin = style.lineJoin;
    ctx.setLineDash(
      style.dashPattern.map((length) => (length * 4) / view.scale),
    );
    if (fill) {
      ctx.fillStyle = style.fillColor;
      ctx.fill(path, "evenodd");
    }
    ctx.stroke(path);
    if (hatch) {
      ctx.strokeStyle = style.hatchColor;
      ctx.lineWidth = Math.max(0.5, style.hatchLineWeight * 4) / view.scale;
      ctx.setLineDash([]);
      ctx.stroke(hatch);
    }
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

export function drawPlanMarks(
  ctx: CanvasRenderingContext2D,
  view: PlanTransform,
  measurements: PlanSegment[],
  start: PlanPoint | null,
  current: PlanPoint | null,
  snap: PlanSnap | null,
  width: number,
  height: number,
  dpr: number,
) {
  const screen = (point: PlanPoint) => ({
    x: point.x * view.scale + view.x,
    y: point.y * view.scale + view.y,
  });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  function measure(line: PlanSegment, active: boolean) {
    const a = screen(line.start),
      b = screen(line.end);
    ctx.strokeStyle = active ? "#b34000" : "#000091";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(active ? [5, 3] : []);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const point of [a, b]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const text = `${planDistance(line.start, line.end).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} m`;
    ctx.font = "600 13px Marianne, system-ui, sans-serif";
    const labelWidth = ctx.measureText(text).width + 12;
    const x = (a.x + b.x) / 2,
      y = (a.y + b.y) / 2 - 15;
    ctx.fillStyle = "white";
    ctx.fillRect(x - labelWidth / 2, y - 11, labelWidth, 22);
    ctx.strokeRect(x - labelWidth / 2, y - 11, labelWidth, 22);
    ctx.fillStyle = "#161616";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }
  for (const line of measurements) measure(line, false);
  if (start && current) measure({ start, end: current }, true);
  if (!snap) return;
  const p = screen(snap.point);
  ctx.strokeStyle = "#18753c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - 11, p.y);
  ctx.lineTo(p.x + 11, p.y);
  ctx.moveTo(p.x, p.y - 11);
  ctx.lineTo(p.x, p.y + 11);
  ctx.stroke();
  if (snap.kind === "vertex") ctx.strokeRect(p.x - 5, p.y - 5, 10, 10);
  else {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}
