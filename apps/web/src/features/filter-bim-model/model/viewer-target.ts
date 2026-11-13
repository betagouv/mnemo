import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";

export type BimFilterViewer = Pick<
  IfcViewerController,
  | "subscribe"
  | "countBim"
  | "findBimIds"
  | "getSnapshot"
  | "getVisualPlan"
  | "applyVisualPlan"
  | "resetVisuals"
  | "setIsolationContext"
>;
