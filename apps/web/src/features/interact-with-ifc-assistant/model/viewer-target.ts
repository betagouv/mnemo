import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";

export type AssistantViewer = Pick<
  IfcViewerController,
  | "applyVisualPlan"
  | "fitToView"
  | "frameSelection"
  | "findBimIds"
  | "getSnapshot"
  | "queryBim"
  | "resetVisuals"
  | "selectEntity"
>;
