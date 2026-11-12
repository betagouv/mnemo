import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";

export type MeasurementViewer = Pick<
  IfcViewerController,
  | "measurementToProject"
  | "measurementFromProject"
  | "getMeasurementRay"
  | "onMeasurementPick"
  | "pickMeasurementPoint"
  | "projectWorldPoints"
>;
