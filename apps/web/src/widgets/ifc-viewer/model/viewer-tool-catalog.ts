const cutsPanel = {
  title: "Coupes",
  icon: "fr-icon-crop-line",
  width: "20rem",
} as const;

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
  cutPlane: cutsPanel,
  cutBox: cutsPanel,
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
  floorPlan: {
    title: "Vues en plan",
    icon: "floorPlan",
    width: "24rem",
  },
} as const;
export type ViewerPanelId = keyof typeof viewerPanels;
export type ViewerIcon = (typeof viewerPanels)[ViewerPanelId]["icon"];
export const viewerToolGroups = [
  {
    id: "layers",
    label: viewerPanels.layers.title,
    icon: viewerPanels.layers.icon,
    panel: "layers",
  },
  {
    id: "views",
    label: viewerPanels.floorPlan.title,
    icon: viewerPanels.floorPlan.icon,
    panel: "floorPlan",
  },
  {
    id: "cuts",
    label: viewerPanels.cutPlane.title,
    icon: viewerPanels.cutPlane.icon,
    panel: "cutPlane",
  },
  {
    id: "measurements",
    label: "Mesures",
    icon: viewerPanels.distance.icon,
    panel: "distance",
  },
  {
    id: "filters",
    label: viewerPanels.filters.title,
    icon: viewerPanels.filters.icon,
    panel: "filters",
  },
  {
    id: "annotations",
    label: viewerPanels.bcf.title,
    icon: viewerPanels.bcf.icon,
    panel: "bcf",
  },
] as const;
export const viewerSecondaryTools = [
  {
    id: "information",
    label: viewerPanels.information.title,
    icon: viewerPanels.information.icon,
    panel: "information",
  },
  {
    id: "help",
    label: viewerPanels.help.title,
    icon: viewerPanels.help.icon,
    panel: "help",
  },
] as const;
export type ViewerToolGroupId =
  | (typeof viewerToolGroups)[number]["id"]
  | (typeof viewerSecondaryTools)[number]["id"];
