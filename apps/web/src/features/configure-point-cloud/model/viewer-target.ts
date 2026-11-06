import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";

export type PointCloudViewer = Pick<
  IfcViewerController,
  | "loadPointCloud"
  | "removePointCloud"
  | "setPointCloudTransform"
  | "setPointCloudPointBudget"
>;
