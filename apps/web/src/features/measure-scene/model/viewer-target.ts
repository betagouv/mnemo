import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";

export type MeasurementViewer = Pick<
  IfcViewerController,
  | "getMeasurementRay"
  | "onMeasurementPick"
  | "pickMeasurementPoint"
  | "projectWorldPoints"
>;
