import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";

export type FloorPlanViewer = Pick<
  IfcViewerController,
  "generateFloorPlan" | "cancelFloorPlan"
>;
