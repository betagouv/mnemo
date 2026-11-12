"use client";

import type { ReactNode } from "react";
import type {
  IfcViewerController,
  IfcViewerSnapshot,
} from "@mnemo/ifc-viewer-adapter";
import { SectionPanel } from "@/features/control-section";
import { type ViewerPanelId } from "../model/viewer-tool-catalog";

export function ViewerPanelContent({
  panel,
  snapshot,
  getViewer,
  hasActiveIfc,
  onSectionModeChange,
  floorPlans,
  measurements,
}: {
  panel: ViewerPanelId | null;
  snapshot: IfcViewerSnapshot;
  getViewer: () => IfcViewerController | null;
  hasActiveIfc: boolean;
  onSectionModeChange: (mode: "plane" | "box") => void;
  floorPlans: ReactNode;
  measurements: ReactNode;
}) {
  switch (panel) {
    case "assistant":
      return hasActiveIfc ? null : (
        <p className="p-4">
          Ajoutez une maquette IFC pour utiliser l’assistant.
        </p>
      );
    case "cut-plane":
    case "cut-box":
      return (
        <SectionPanel
          getViewer={getViewer}
          hasIfcGeometry={snapshot.meshCount > 0}
          hasPointCloud={snapshot.pointClouds.some(
            (cloud) => cloud.pointCount > 0,
          )}
          mode={panel === "cut-box" ? "box" : "plane"}
          onModeChange={onSectionModeChange}
          section={snapshot.section}
        />
      );
    case "distance":
    case "surface":
      return measurements;
    case "floor-plan":
      return floorPlans;
    case "information":
      return (
        <div className="p-4">
          <dl className="m-0 grid grid-cols-2 gap-3 text-sm">
            <dt>Entités IFC</dt>
            <dd className="m-0 text-right font-bold">
              {snapshot.entityCount?.toLocaleString("fr-FR") ?? "—"}
            </dd>
            <dt>Maillages</dt>
            <dd className="m-0 text-right font-bold">
              {snapshot.meshCount.toLocaleString("fr-FR")}
            </dd>
            <dt>Points chargés</dt>
            <dd className="m-0 text-right font-bold">
              {snapshot.pointClouds
                .reduce((total, cloud) => total + cloud.pointCount, 0)
                .toLocaleString("fr-FR")}
            </dd>
          </dl>
          <p className="mb-0 mt-4 text-xs text-[var(--text-mention-grey)]">
            Un maillage est une géométrie dessinée. Il ne correspond pas
            nécessairement à un objet IFC.
          </p>
        </div>
      );
    case "help":
      return (
        <div className="p-4">
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            <dt>Clic</dt>
            <dd className="m-0">Sélectionner un élément</dd>
            <dt>Ctrl / Cmd + clic</dt>
            <dd className="m-0">Ajouter à la sélection</dd>
            <dt>Glisser</dt>
            <dd className="m-0">Orbiter autour de la scène</dd>
            <dt>Maj + glisser</dt>
            <dd className="m-0">Déplacer la vue</dd>
            <dt>Molette</dt>
            <dd className="m-0">Zoomer</dd>
          </dl>
          <p className="mt-4 text-sm">
            Cliquez sur une face du cube pour orienter la vue. Le bouton Tout
            cadrer affiche l’ensemble du projet.
          </p>
        </div>
      );
    default:
      return null;
  }
}
