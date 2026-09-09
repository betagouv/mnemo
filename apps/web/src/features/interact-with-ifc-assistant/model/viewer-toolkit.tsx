"use client";

import { defineToolkit } from "@assistant-ui/react";

import type { ViewerToolActions } from "./viewer-tool-actions";
import {
  frameViewParameters,
  hideElementsParameters,
  inspectSceneParameters,
  queryElementsParameters,
  resetSceneParameters,
  selectElementParameters,
  setSceneStyleParameters,
} from "./viewer-tool-schemas";

export function createViewerAssistantToolkit(actions: ViewerToolActions) {
  return defineToolkit({
    inspect_scene: {
      type: "frontend",
      description:
        "Lire l’état courant de la scène : classes IFC réellement présentes, niveaux, sélection et filtre visuel. À appeler avant toute action BIM.",
      parameters: inspectSceneParameters,
      execute: () => actions.inspectScene(),
      renderText: {
        running: "Lecture de la maquette…",
        complete: "Contexte de la maquette lu",
      },
    },
    query_elements: {
      type: "frontend",
      description:
        "Trouver les éléments IFC de la maquette ouverte par classe et/ou niveau. Renvoie Express ID, GlobalId, classe, nom et niveau.",
      parameters: queryElementsParameters,
      execute: (input) => actions.queryElements(input),
      renderText: {
        running: "Recherche dans la maquette…",
        complete: ({ result }) => `${result?.total ?? 0} élément(s) trouvé(s)`,
      },
    },
    set_scene_style: {
      type: "frontend",
      description:
        "Colorer un ou plusieurs groupes BIM et, si focus=true, isoler leur union. Utiliser un seul appel pour les demandes multi-niveaux ou multi-classes. L’opacité du reste est toujours gérée par l’interface.",
      parameters: setSceneStyleParameters,
      execute: (input) => actions.setSceneStyle(input),
      renderText: {
        running: "Application du style BIM…",
        complete: ({ result }) =>
          `${result?.matched ?? 0} élément(s) mis en forme`,
      },
    },
    hide_elements: {
      type: "frontend",
      description:
        "Masquer complètement les éléments qui correspondent à une ou plusieurs classes/niveaux.",
      parameters: hideElementsParameters,
      execute: (input) => actions.hideElements(input),
      renderText: {
        running: "Masquage des éléments…",
        complete: ({ result }) => `${result?.hidden ?? 0} élément(s) masqué(s)`,
      },
    },
    select_element: {
      type: "frontend",
      description:
        "Sélectionner un élément IFC à partir de son Express ID et éventuellement cadrer la caméra dessus.",
      parameters: selectElementParameters,
      execute: (input) => actions.selectElement(input),
      renderText: {
        running: "Sélection de l’élément…",
        complete: ({ result }) =>
          result?.selected
            ? `${result.selected.ifcClass} #${result.selected.expressId} sélectionné`
            : "Sélection terminée",
      },
    },
    frame_view: {
      type: "frontend",
      description:
        "Cadrer la caméra sur toute la scène ou sur l’élément IFC actuellement sélectionné.",
      parameters: frameViewParameters,
      execute: (input) => actions.frameView(input),
      renderText: {
        running: "Cadrage de la caméra…",
        complete: "Caméra cadrée",
      },
    },
    reset_scene: {
      type: "frontend",
      description:
        "Réinitialiser les masquages, isolations, couleurs et sélection, puis cadrer toute la scène.",
      parameters: resetSceneParameters,
      execute: () => actions.resetScene(),
      renderText: {
        running: "Réinitialisation de la scène…",
        complete: "Scène réinitialisée",
      },
    },
  });
}
