"use client";
import type { IfcViewerSnapshot } from "@mnemo/ifc-viewer-adapter";
import type { BimViewer } from "../model/viewer-target";
import { BimExplorer } from "./bim-explorer";
export function BimAppearancePanel({
  snapshot,
  getViewer,
}: {
  snapshot: IfcViewerSnapshot;
  getViewer: () => BimViewer | null;
}) {
  if (!snapshot.catalog)
    return (
      <p className="p-4">Chargez une maquette IFC pour utiliser les filtres.</p>
    );
  return (
    <BimExplorer
      key={snapshot.activeModelId}
      catalog={snapshot.catalog}
      visual={snapshot.visual}
      onColor={(query, hex, label) => {
        const color = [1, 3, 5].map(
          (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
        );
        getViewer()?.color(query, [color[0], color[1], color[2], 1], label);
      }}
      onColorByStorey={() => getViewer()?.colorByStorey()}
      onHide={(query, label) => getViewer()?.hide(query, label)}
      onIsolate={(query, label) => getViewer()?.isolate(query, label)}
      onReset={() => getViewer()?.resetVisuals()}
      onSetContext={(show, opacity) =>
        getViewer()?.setIsolationContext(show, opacity)
      }
    />
  );
}
