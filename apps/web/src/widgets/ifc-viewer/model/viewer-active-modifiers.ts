import type { IfcViewerSnapshot } from "@mnemo/ifc-viewer-adapter";

import type { ViewerPanelId, ViewerToolGroupId } from "./viewer-tool-catalog";

export type ViewerActiveModifier = {
  id: string;
  label: string;
  icon: string;
  panel: ViewerPanelId;
  group: ViewerToolGroupId;
};

type ModifierSource = {
  getActive: (snapshot: IfcViewerSnapshot) => ViewerActiveModifier | null;
};

/** Register future scene modifiers here; the indicator remains UI-agnostic. */
const modifierSources: readonly ModifierSource[] = [
  {
    getActive: (snapshot) => {
      if (snapshot.section.active === "plane") {
        return {
          id: "section",
          label: "Plan de coupe actif",
          icon: "fr-icon-crop-line",
          panel: "cut-plane",
          group: "cuts",
        };
      }
      if (snapshot.section.active === "box") {
        return {
          id: "section",
          label: "Boîte de coupe active",
          icon: "fr-icon-crop-line",
          panel: "cut-box",
          group: "cuts",
        };
      }
      return null;
    },
  },
];

export function getActiveViewerModifiers(
  snapshot: IfcViewerSnapshot,
): ViewerActiveModifier[] {
  return modifierSources.flatMap((source) => {
    const modifier = source.getActive(snapshot);
    return modifier ? [modifier] : [];
  });
}
