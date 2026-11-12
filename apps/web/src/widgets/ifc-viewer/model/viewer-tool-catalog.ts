export const viewerPanels = {
  information: {
    title: "Informations sur la scène",
    icon: "fr-icon-information-line",
  },
  help: { title: "Aide à la navigation", icon: "fr-icon-question-line" },
  layers: { title: "Maquettes et relevés", icon: "fr-icon-stack-line" },
  bcf: { title: "Remarques BCF", icon: "fr-icon-chat-3-line" },
  assistant: { title: "Assistant", icon: "fr-icon-sparkling-line" },
  "cut-plane": { title: "Coupes", icon: "fr-icon-crop-line" },
  "cut-box": { title: "Coupes", icon: "fr-icon-crop-line" },
  distance: { title: "Mesure de distance", icon: "fr-icon-ruler-line" },
  surface: { title: "Mesure de surface", icon: "fr-icon-ruler-line" },
  filters: { title: "Filtres IFC", icon: "fr-icon-filter-line" },
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
    id: "filters",
    label: "Filtres IFC",
    icon: "fr-icon-filter-line",
    panel: "filters",
  },
  {
    id: "cuts",
    label: "Coupes",
    icon: "fr-icon-crop-line",
    panel: "cut-plane",
  },
  {
    id: "measurements",
    label: "Mesures",
    icon: "fr-icon-ruler-line",
    panel: "distance",
  },
  {
    id: "views",
    label: "Vues en plan",
    icon: "fr-icon-layout-grid-line",
    panel: "floor-plan",
  },
  {
    id: "annotations",
    label: "Remarques BCF",
    icon: "fr-icon-chat-3-line",
    panel: "bcf",
  },
] as const;
export const viewerSecondaryTools = [
  {
    id: "information",
    label: "Informations sur la scène",
    icon: "fr-icon-information-line",
    panel: "information",
  },
  {
    id: "help",
    label: "Aide à la navigation",
    icon: "fr-icon-question-line",
    panel: "help",
  },
] as const;
export type ViewerToolGroupId =
  | (typeof viewerToolGroups)[number]["id"]
  | (typeof viewerSecondaryTools)[number]["id"];
