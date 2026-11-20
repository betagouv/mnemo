import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";

export type SectionViewer = Pick<
  IfcViewerController,
  | "cancelSectionPick"
  | "fitSectionBox"
  | "getSectionBounds"
  | "getSnapshot"
  | "moveSectionBoxFace"
  | "projectWorldPoint"
  | "projectWorldPoints"
  | "resetSection"
  | "setSectionCustomDistance"
  | "setSectionFlipped"
  | "setSectionPosition"
  | "showSectionBox"
  | "showSectionPlane"
  | "startSectionPick"
>;
