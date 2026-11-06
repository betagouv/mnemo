import type { MeshData } from "@ifc-lite/geometry";
import { meshOutline2d } from "@ifc-lite/wasm";
import {
  projectTo2D,
  type MeshOutline2D,
  type SectionAxis,
} from "@ifc-lite/drawing-2d";

/** Bridge the public WASM footprint binding to IFC-Lite's outline provider. */
export function extractFloorPlanOutline(
  mesh: MeshData,
  axis: SectionAxis,
  flipped: boolean,
): MeshOutline2D | null {
  let outline: ReturnType<typeof meshOutline2d>;
  try {
    outline = meshOutline2d(
      mesh.positions,
      mesh.indices,
      { x: 0, y: 1, z: 2 }[axis],
      flipped,
    );
  } catch (error) {
    const limit =
      error instanceof Error
        ? /exceed the (\d+)-triangle overlay budget/.exec(error.message)?.[1]
        : undefined;
    if (limit) {
      throw new Error(
        `Le maillage IFC #${mesh.expressId} dépasse la limite de ${Number(limit).toLocaleString("fr-FR")} triangles projetés par maillage d'IFC-Lite. La génération du plan a été interrompue pour éviter un résultat incomplet.`,
        { cause: error },
      );
    }
    throw error;
  }
  if (!outline) return null;
  try {
    const [x, y, z] = mesh.origin ?? [0, 0, 0];
    const shift = projectTo2D({ x, y, z }, axis, flipped);
    const axisOrigin = { x, y, z }[axis];
    // Float64 placement avoids rounding large origins back into the local f32 mesh.
    const contours: Float64Array[] = [];
    for (let i = 0; i < outline.contourCount; i++) {
      const ring = outline.contour(i);
      if (!ring) continue;
      const placed = new Float64Array(ring.length);
      for (let j = 0; j < ring.length; j += 2) {
        placed[j] = ring[j] + shift.x;
        placed[j + 1] = ring[j + 1] + shift.y;
      }
      contours.push(placed);
    }
    return {
      contours,
      axisMin: outline.axisMin + axisOrigin,
      axisMax: outline.axisMax + axisOrigin,
    };
  } finally {
    outline.free();
  }
}
