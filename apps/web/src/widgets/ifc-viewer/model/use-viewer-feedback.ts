"use client";
import { useCallback, useState } from "react";
import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";
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
    } else if (modifier.reset === "visual") {
      const plan = viewer.getVisualPlan();
      const assetId = viewer.getSnapshot().activeModelId;
      viewer.resetVisuals();
      const expected = viewer.getSnapshot().visual;
      setFeedback({
        message: "Affichage réinitialisé",
        canUndo: () =>
          viewer.getSnapshot().activeModelId === assetId &&
          viewer.getSnapshot().visual === expected,
        undo: () => viewer.applyVisualPlan(plan),
      });
    } else {
      viewer.resetLayerVisibility();
      for (const id of hiddenCloudIds) showCloud(id, true);
      setFeedback({ message: "Visibilité des fichiers rétablie" });
    }
  };
  return { feedback, dismiss, reset };
}
