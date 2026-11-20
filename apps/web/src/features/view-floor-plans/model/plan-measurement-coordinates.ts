import type {
  FloorPlanDrawing,
  IfcViewerController,
} from "@mnemo/ifc-viewer-adapter";
import type { Point3 } from "@mnemo/domain/measurement";
import type { PlanPoint } from "./floor-plan-navigation";
export type PlanMeasurementViewer = Pick<
  IfcViewerController,
  "measurementToProject" | "measurementFromProject"
>;
/** IFC-Lite's horizontal drawing uses renderer X/Z, with optional flipped U. */
export function planPointToProject(
  viewer: PlanMeasurementViewer,
  drawing: FloorPlanDrawing,
  point: PlanPoint,
) {
  return viewer.measurementToProject(planPointToScene(drawing, point));
}
export function planPointToScene(drawing: FloorPlanDrawing, point: PlanPoint) {
  const plane = drawing.config.plane;
  return {
    x: plane.flipped ? -point.x : point.x,
    y: plane.position,
    z: point.y,
  };
}
export function projectPointToPlan(
  viewer: PlanMeasurementViewer,
  drawing: FloorPlanDrawing,
  point: Point3,
) {
  const render = viewer.measurementFromProject(point);
  return {
    x: drawing.config.plane.flipped ? -render.x : render.x,
    y: render.z,
  };
}
