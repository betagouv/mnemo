"use client";

import Alert from "@codegouvfr/react-dsfr/Alert";
import type { ReactNode } from "react";
import type {
  IfcViewerController,
  IfcViewerSnapshot,
} from "@mnemo/ifc-viewer-adapter";
import { SectionPanel } from "@/features/control-section";
import { viewerPanels, type ViewerPanelId } from "../model/viewer-tool-catalog";

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
    default: {
      const config = panel ? viewerPanels[panel] : null;
      if (!config || !("upcoming" in config)) return null;
      return (
        <div className="p-4">
          <Alert
            description={config.upcoming}
            role="status"
            severity="info"
            title="Outil en préparation"
          />
        </div>
      );
    }
  }
}
