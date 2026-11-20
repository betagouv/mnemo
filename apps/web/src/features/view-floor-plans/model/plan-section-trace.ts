import type { IfcSectionSnapshot } from "@mnemo/ifc-viewer-adapter";
import type { PlanSegment } from "./floor-plan-navigation";

/** Project the two picked endpoints onto the current (possibly moved) vertical cut. */
export function planSectionTrace(
  section: IfcSectionSnapshot,
  flippedU: boolean,
): PlanSegment | null {
  const { active, plane, trace } = section;
  if (active !== "plane" || !trace || !plane.normal || plane.distance === null)
    return null;
  const [nx, , nz] = plane.normal;
  const offset = plane.distance - nx * trace.start[0] - nz * trace.start[2];
  function project([x, , z]: [number, number, number]) {
    return { x: (flippedU ? -1 : 1) * (x + nx * offset), y: z + nz * offset };
  }
  return { start: project(trace.start), end: project(trace.end) };
}
