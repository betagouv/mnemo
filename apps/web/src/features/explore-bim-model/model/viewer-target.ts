import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";

export type BimViewer = Pick<
  IfcViewerController,
  | "frameModel"
  | "getLayerVisibility"
  | "getLayerExceptionCount"
  | "getBimElements"
  | "getBimElement"
  | "getBimClasses"
  | "setLayerVisibility"
  | "setActiveModel"
  | "selectModelEntity"
  | "color"
  | "colorByStorey"
  | "hide"
  | "isolate"
  | "resetVisuals"
  | "setIsolationContext"
>;
