import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";

export type BcfViewer = Pick<
  IfcViewerController,
  | "bcfMarkers"
  | "projectWorldPoints"
  | "captureBcfViewpoint"
  | "setBcfSelection"
  | "bcfObjects"
>;
