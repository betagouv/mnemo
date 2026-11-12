export const viewerPanels = {
  information: {
    title: "Informations sur la scène",
    icon: "fr-icon-information-line",
    width: "20rem",
  },
  help: {
    title: "Aide à la navigation",
    icon: "fr-icon-question-line",
    width: "20rem",
  },
  layers: {
    title: "Maquettes et relevés",
    icon: "fr-icon-stack-line",
    width: "20rem",
  },
  bcf: { title: "Remarques BCF", icon: "fr-icon-chat-3-line", width: "24rem" },
  assistant: {
    title: "Assistant",
    icon: "fr-icon-sparkling-line",
    width: "24rem",
  },
  "cut-plane": { title: "Coupes", icon: "fr-icon-crop-line", width: "20rem" },
  "cut-box": { title: "Coupes", icon: "fr-icon-crop-line", width: "20rem" },
  distance: {
    title: "Mesure de distance",
    icon: "fr-icon-ruler-line",
    width: "20rem",
  },
  surface: {
    title: "Mesure de surface",
    icon: "fr-icon-ruler-line",
    width: "20rem",
  },
  filters: {
    title: "Filtres IFC",
    icon: "fr-icon-filter-line",
    width: "28rem",
  },
  "floor-plan": {
    title: "Vues en plan",
    icon: "fr-icon-layout-grid-line",
    width: "24rem",
  },
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
