import type { IfcViewerSnapshot } from "@mnemo/ifc-viewer-adapter";

import type { ViewerPanelId, ViewerToolGroupId } from "./viewer-tool-catalog";

export type ViewerActiveModifier = {
  id: string;
  label: string;
  icon: string;
  panel: ViewerPanelId;
  group: ViewerToolGroupId;
  reset?: "section" | "visual" | "visibility" | "selection-isolation";
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
          reset: "section",
          label: "Plan de coupe actif",
          icon: "fr-icon-crop-line",
          panel: "cut-plane",
          group: "cuts",
        };
      }
      if (snapshot.section.active === "box") {
        return {
          id: "section",
          reset: "section",
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
  visibilityChanged = false,
): ViewerActiveModifier[] {
  const modifiers = modifierSources.flatMap((source) => {
    const modifier = source.getActive(snapshot);
    return modifier ? [modifier] : [];
  });
  if (snapshot.visual.mode !== "all")
    modifiers.push({
      id: snapshot.selectionIsolationActive ? "selection-isolation" : "visual",
      label: snapshot.visual.label || "Affichage modifié",
      icon:
        snapshot.visual.mode === "color"
          ? "fr-icon-palette-line"
          : "fr-icon-filter-line",
      panel: "filters",
      group: "filters",
      reset: snapshot.selectionIsolationActive
        ? "selection-isolation"
        : "visual",
    });
  if (visibilityChanged)
    modifiers.push({
      id: "visibility",
      label: "Visibilité modifiée",
      icon: "fr-icon-eye-off-line",
      panel: "layers",
      group: "layers",
      reset: "visibility",
    });
  return modifiers;
}
