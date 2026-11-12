"use client";
import { useCallback, useState } from "react";
import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";
import type { BimFilterControls } from "@/features/filter-bim-model";
import type { ViewerActiveModifier } from "./viewer-active-modifiers";
export type ViewerFeedback = {
  message: string;
  undo?: () => void;
  canUndo?: () => boolean;
};
export function useViewerFeedback(
  getViewer: () => IfcViewerController | null,
  hiddenCloudIds: ReadonlySet<string>,
  showCloud: (id: string, visible: boolean) => void,
  resetBimFilters: BimFilterControls["resetVisuals"],
) {
  const [feedback, setFeedback] = useState<ViewerFeedback | null>(null);
  const dismiss = useCallback(() => setFeedback(null), []);
  const reset = (modifier: ViewerActiveModifier) => {
    const viewer = getViewer();
    if (!viewer) return;
    if (modifier.reset === "section") {
      const section = viewer.getSnapshot().section;
      viewer.hideSection();
      const expected = viewer.getSnapshot().section;
      setFeedback({
        message: "Coupe masquée",
        canUndo: () => viewer.getSnapshot().section === expected,
        undo: () =>
          section.active === "box"
            ? viewer.showSectionBox()
            : viewer.showSectionPlane(),
      });
    } else if (modifier.reset === "selection-isolation") {
      viewer.clearSelectionIsolation();
      setFeedback(null);
    } else if (modifier.reset === "visual") {
      const restoration = resetBimFilters();
      if (!restoration) return;
      setFeedback({
        message: "Affichage réinitialisé",
        ...restoration,
      });
    } else {
      viewer.resetLayerVisibility();
      for (const id of hiddenCloudIds) showCloud(id, true);
      setFeedback({ message: "Visibilité des fichiers rétablie" });
    }
  };
  return { feedback, dismiss, reset };
}
