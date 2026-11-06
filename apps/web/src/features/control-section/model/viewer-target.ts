import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";

export type SectionViewer = Pick<
  IfcViewerController,
  | "cancelSectionPick"
  | "fitSectionBox"
  | "getSectionBounds"
  | "getSnapshot"
  | "hideSection"
  | "moveSectionBoxFace"
  | "projectWorldPoint"
  | "projectWorldPoints"
  | "resetSection"
  | "setSectionAxis"
  | "setSectionCustomDistance"
  | "setSectionFlipped"
  | "setSectionPosition"
  | "showSectionBox"
  | "showSectionPlane"
  | "startSectionPick"
>;
