import type { MeshData } from "@ifc-lite/geometry";

// Keep the same three-metre projection bands as IFC-Lite's floor-plan helper.
export const floorPlanProjectionDepth = 3;
const heights = new WeakMap<MeshData, { min: number; max: number }>();

export function intersectsFloorPlan(mesh: MeshData, elevation: number) {
  let bounds = heights.get(mesh);
  if (!bounds) {
    let min = Infinity;
    let max = -Infinity;
    const origin = mesh.origin?.[1] ?? 0;
    for (let i = 1; i < mesh.positions.length; i += 3) {
      const y = mesh.positions[i] + origin;
      min = Math.min(min, y);
      max = Math.max(max, y);
    }
    bounds = { min, max };
    heights.set(mesh, bounds);
  }
  // Retain malformed bounds for the vendor to handle rather than hiding geometry.
  if (!Number.isFinite(bounds.min) || !Number.isFinite(bounds.max)) return true;
  const tolerance = 0.001;
  return (
    bounds.max >= elevation - floorPlanProjectionDepth - tolerance &&
    bounds.min <= elevation + floorPlanProjectionDepth + tolerance
  );
}
