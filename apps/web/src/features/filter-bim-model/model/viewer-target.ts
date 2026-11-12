import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";

export type BimFilterViewer = Pick<
  IfcViewerController,
  | "countBim"
  | "findBimIds"
  | "getSnapshot"
  | "getVisualPlan"
  | "getStoreyColorGroups"
  | "applyVisualPlan"
  | "setActiveModel"
  | "resetVisuals"
  | "setIsolationContext"
>;
