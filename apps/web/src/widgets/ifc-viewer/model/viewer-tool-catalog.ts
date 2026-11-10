export const viewerPanels = {
  layers: { title: "Maquettes et relevés", icon: "fr-icon-stack-line" },
  bcf: { title: "Remarques BCF", icon: "fr-icon-chat-3-line" },
  assistant: { title: "Assistant", icon: "fr-icon-sparkling-line" },
  "cut-plane": { title: "Coupes", icon: "fr-icon-crop-line" },
  "cut-box": { title: "Coupes", icon: "fr-icon-crop-line" },
  colorization: { title: "Filtres et couleurs", icon: "fr-icon-palette-line" },
  "floor-plan": { title: "Vues en plan", icon: "fr-icon-layout-grid-line" },
} as const;
export type ViewerPanelId = keyof typeof viewerPanels;
export const viewerToolGroups = [
  {
    id: "layers",
    label: "Maquettes et relevés",
    icon: "fr-icon-stack-line",
    panel: "layers",
  },
  {
    id: "cuts",
    label: "Coupes",
    icon: "fr-icon-crop-line",
    panel: "cut-plane",
  },
  {
    id: "views",
    label: "Vues en plan",
    icon: "fr-icon-layout-grid-line",
    panel: "floor-plan",
  },
  {
    id: "colors",
    label: "Filtres et couleurs",
    icon: "fr-icon-palette-line",
    panel: "colorization",
  },
  {
    id: "annotations",
    label: "Remarques BCF",
    icon: "fr-icon-chat-3-line",
    panel: "bcf",
  },
] as const;
export type ViewerToolGroupId = (typeof viewerToolGroups)[number]["id"];
