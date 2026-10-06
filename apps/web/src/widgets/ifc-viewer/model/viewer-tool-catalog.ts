export const viewerPanels = {
  properties: {
    title: "Propriétés IFC",
    icon: "fr-icon-file-text-line",
  },
  bcf: {
    title: "Remarques BCF",
    icon: "fr-icon-chat-3-line",
  },
  assistant: {
    title: "Assistant",
    icon: "fr-icon-chat-3-line",
  },
  "cut-plane": {
    title: "Coupe par plan",
    icon: "fr-icon-crop-line",
    upcoming: "Définir un plan de coupe dans la scène sera disponible ici.",
  },
  "cut-box": {
    title: "Coupe par boîte",
    icon: "fr-icon-crop-line",
    upcoming: "Délimiter une zone de coupe sera disponible ici.",
  },
  distance: {
    title: "Mesure de distance",
    icon: "fr-icon-ruler-line",
    upcoming: "Mesurer entre deux points de la scène sera disponible ici.",
  },
  surface: {
    title: "Mesure de surface",
    icon: "fr-icon-ruler-line",
    upcoming: "Mesurer une surface de la maquette sera disponible ici.",
  },
  colorization: {
    title: "Colorisation",
    icon: "fr-icon-palette-line",
    upcoming:
      "Les filtres et couleurs sont actuellement accessibles dans l’explorateur BIM à gauche.",
  },
  "floor-plan": {
    title: "Vue en plan",
    icon: "fr-icon-layout-grid-line",
    upcoming: "La génération de vues en plan sera disponible ici.",
  },
  elevation: {
    title: "Élévation",
    icon: "fr-icon-layout-grid-line",
    upcoming: "La génération d’élévations sera disponible ici.",
  },
} as const;

export type ViewerPanelId = keyof typeof viewerPanels;

type ToolAction = { label: string; panel: ViewerPanelId };

export type ViewerToolGroup = {
  id: string;
  label: string;
  icon: string;
  actions: readonly ToolAction[];
};

export const viewerToolGroups = [
  {
    id: "cuts",
    label: "Coupes",
    icon: "fr-icon-crop-line",
    actions: [
      { label: "Coupe par plan", panel: "cut-plane" },
      { label: "Coupe par boîte", panel: "cut-box" },
    ],
  },
  {
    id: "measurements",
    label: "Mesures",
    icon: "fr-icon-ruler-line",
    actions: [
      { label: "Distance", panel: "distance" },
      { label: "Surface", panel: "surface" },
    ],
  },
  {
    id: "annotations",
    label: "Annotations",
    icon: "fr-icon-chat-3-line",
    actions: [{ label: "Remarques BCF", panel: "bcf" }],
  },
  {
    id: "data",
    label: "Données",
    icon: "fr-icon-file-text-line",
    actions: [
      { label: "Propriétés IFC", panel: "properties" },
      { label: "Assistant", panel: "assistant" },
    ],
  },
  {
    id: "colors",
    label: "Colorisation",
    icon: "fr-icon-palette-line",
    actions: [{ label: "Filtres et couleurs", panel: "colorization" }],
  },
  {
    id: "views",
    label: "Vues 2D",
    icon: "fr-icon-layout-grid-line",
    actions: [
      { label: "Vue en plan", panel: "floor-plan" },
      { label: "Élévation", panel: "elevation" },
    ],
  },
  {
    id: "export",
    label: "Exporter",
    icon: "fr-icon-download-line",
    actions: [{ label: "Remarques BCF", panel: "bcf" }],
  },
] as const satisfies readonly ViewerToolGroup[];
