import {
  localViewerToProjected,
  NORMAL_COORD_THRESHOLD_M,
  resolveSpatialPlacement,
  type MeshData,
  type ModelSpatialReference,
  type SpatialAffineTransform,
  type SpatialFrameOffset,
} from "@ifc-lite/geometry";
import { ifcToViewerAxes } from "@ifc-lite/geometry/world-frame";
import type { MapReference } from "@mnemo/contracts/map-reference";

export type IfcPositioningIssue =
  | "no-georeference"
  | "site-only"
  | "invalid-conversion"
  | "unknown-crs"
  | "out-of-area"
  | "missing-grid"
  | "approximate-datum"
  | "assumed-map-coordinates"
  | "different-vertical-datum";

export type Point = readonly [number, number, number];

export type ModelAlignment = {
  /** Authored to project coordinates, both Y-up metres. Null keeps the authored ones. */
  transform: SpatialAffineTransform | null;
  issues: IfcPositioningIssue[];
};

/** National grids start hundreds of kilometres from their origin. */
const minimumMapMetres = 100_000;

/** Whether authored Y-up geometry already lies at the conversion's map position. */
export function isAtMapPosition(center: Point, map: MapReference) {
  return (
    Math.hypot(map.eastings, map.northings) >= minimumMapMetres &&
    Math.hypot(center[0] - map.eastings, -center[2] - map.northings) <
      NORMAL_COORD_THRESHOLD_M
  );
}

/** The frame whose coordinates are the map coordinates themselves. */
export function mapFrame(reference: MapReference): MapReference {
  return {
    ...reference,
    eastings: 0,
    northings: 0,
    orthogonalHeight: 0,
    xAxisAbscissa: 1,
    xAxisOrdinate: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  };
}

/**
 * Some exporters place geometry at absolute map coordinates and repeat them in
 * the map conversion, others omit the conversion. Read both as map coordinates.
 */
export function interpretReference(
  declared: MapReference | null,
  project: MapReference | null,
  center: Point,
): { reference: MapReference | null; assumed: boolean } {
  if (declared)
    return isAtMapPosition(center, declared)
      ? {
          reference: {
            ...mapFrame(declared),
            orthogonalHeight: declared.orthogonalHeight,
          },
          assumed: true,
        }
      : { reference: declared, assumed: false };
  return project && isAtMapPosition(center, project)
    ? { reference: mapFrame(project), assumed: true }
    : { reference: null, assumed: false };
}

function spatialReference(
  reference: MapReference,
  crs = reference.crs,
): ModelSpatialReference {
  return {
    source: {
      axes: ["east", "up", "south"],
      horizontalUnitToMetres: 1,
      verticalUnitToMetres: 1,
    },
    horizontal: { id: crs },
    localToProjected: { kind: "local-projected-affine", ...reference },
    confidence: "declared",
  };
}

export const sameLabel = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

/**
 * Detect placeholder conversions, such as zero offsets in a national grid. Offsets
 * at map scale in the project's own CRS need no registry lookup.
 */
export async function findMapPositionIssue(
  reference: MapReference,
  project: MapReference | null,
  center: Point,
): Promise<IfcPositioningIssue | null> {
  const projected = localViewerToProjected(spatialReference(reference), center);
  if (!projected) return "invalid-conversion";
  if (
    project &&
    sameLabel(reference.crs, project.crs) &&
    Math.hypot(projected[0], projected[1]) >= minimumMapMetres
  )
    return null;
  const { isInAreaOfUse, resolveProjectedCrs } =
    await import("./coordinate-systems");
  const crs = await resolveProjectedCrs(reference.crs);
  if (!crs) return "unknown-crs";
  return (await isInAreaOfUse(crs, projected)) ? null : "out-of-area";
}

/**
 * Express a model's map conversion in another CRS around its own geometry. The
 * grid convergence and scale of both projections keep it affine; the remaining
 * curvature is sub-millimetre at building size.
 */
async function reproject(
  source: MapReference,
  target: MapReference,
  center: Point,
): Promise<
  | { reference: MapReference; approximate: boolean }
  | { issue: IfcPositioningIssue }
> {
  const { resolveProjectedCrs } = await import("./coordinate-systems");
  const [from, to] = await Promise.all([
    resolveProjectedCrs(source.crs),
    resolveProjectedCrs(target.crs),
  ]);
  if (!from || !to) return { issue: "unknown-crs" };
  if (from.definition === to.definition)
    return { reference: { ...source, crs: target.crs }, approximate: false };
  if (
    from.datumShift === "grid-unavailable" ||
    to.datumShift === "grid-unavailable"
  )
    return { issue: "missing-grid" };
  const projected = localViewerToProjected(spatialReference(source), center);
  if (!projected) return { issue: "invalid-conversion" };
  const geographic = from.toWgs84([projected[0], projected[1]]);
  const mapped = geographic && to.fromWgs84(geographic);
  const fromGrid = from.gridFactors(projected[0], projected[1]);
  const toGrid = mapped && to.gridFactors(mapped[0], mapped[1]);
  if (!mapped || !fromGrid || !toGrid) return { issue: "out-of-area" };
  const turn = fromGrid.gamma - toGrid.gamma;
  const scale = toGrid.pointScale / fromGrid.pointScale;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const reference: MapReference = {
    ...source,
    crs: target.crs,
    xAxisAbscissa: source.xAxisAbscissa * cos - source.xAxisOrdinate * sin,
    xAxisOrdinate: source.xAxisAbscissa * sin + source.xAxisOrdinate * cos,
    scaleX: source.scaleX * scale,
    scaleY: source.scaleY * scale,
  };
  const uncorrected = localViewerToProjected(
    spatialReference({ ...reference, eastings: 0, northings: 0 }),
    center,
  );
  if (!uncorrected) return { issue: "invalid-conversion" };
  return {
    reference: {
      ...reference,
      eastings: mapped[0] - uncorrected[0],
      northings: mapped[1] - uncorrected[1],
    },
    approximate:
      from.datumShift !== "as-defined" || to.datumShift !== "as-defined",
  };
}

/** Align authored coordinates with the project's frame. */
export async function alignModel(
  reference: MapReference,
  project: MapReference,
  center: Point,
): Promise<ModelAlignment> {
  const issues: IfcPositioningIssue[] = [];
  let aligned = reference;
  if (!sameLabel(reference.crs, project.crs)) {
    const result = await reproject(reference, project, center);
    if ("issue" in result) return { transform: null, issues: [result.issue] };
    aligned = result.reference;
    if (result.approximate) issues.push("approximate-datum");
  }
  const resolved = resolveSpatialPlacement(
    spatialReference(aligned, project.crs),
    spatialReference(project),
    // IFC rarely declares a vertical datum; a declared mismatch is reported below.
    { unknownVertical: "assume-compatible" },
  );
  if (!resolved.ok) return { transform: null, issues: ["invalid-conversion"] };
  if (
    reference.verticalDatum &&
    project.verticalDatum &&
    !sameLabel(reference.verticalDatum, project.verticalDatum)
  )
    issues.push("different-vertical-datum");
  return {
    transform:
      resolved.placement.status === "identity"
        ? null
        : resolved.placement.sourceToFederation,
    issues,
  };
}

/** Centre of the authored geometry in Y-up metres. */
export function modelCenter(
  meshes: readonly MeshData[],
  rtc: SpatialFrameOffset,
): Point {
  const offset = ifcToViewerAxes(rtc);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { origin, positions } of meshes)
    if (positions.length)
      for (let axis = 0; axis < 3; axis += 1) {
        const value = (origin?.[axis] ?? 0) + positions[axis]!;
        min[axis] = Math.min(min[axis]!, value);
        max[axis] = Math.max(max[axis]!, value);
      }
  const center = min.map((value, axis) =>
    Number.isFinite(value) ? (value + max[axis]!) / 2 : 0,
  );
  return [center[0]! + offset.x, center[1]! + offset.y, center[2]! + offset.z];
}
