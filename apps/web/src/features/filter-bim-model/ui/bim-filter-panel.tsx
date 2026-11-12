"use client";

import Select from "@codegouvfr/react-dsfr/Select";
import type { IfcViewerSnapshot } from "@mnemo/ifc-viewer-adapter";
import type { BimFilterViewer } from "../model/viewer-target";
import { BimFilters } from "./bim-filters";
import styles from "./bim-filter-panel.module.css";

export function BimFilterPanel({
  snapshot,
  getViewer,
}: {
  snapshot: IfcViewerSnapshot;
  getViewer: () => BimFilterViewer | null;
}) {
  if (!snapshot.catalog)
    return (
      <p className="p-4">Chargez une maquette IFC pour utiliser les filtres.</p>
    );
  const models = snapshot.models.filter((model) => model.phase === "ready");
  return (
    <div className="flex h-full min-h-0 flex-col">
      {models.length > 1 ? (
        <div className={`${styles.fields} p-4 pb-0`}>
          <Select
            label="Maquette ciblée"
            nativeSelectProps={{
              value: snapshot.activeModelId ?? "",
              onChange: (event) =>
                getViewer()?.setActiveModel(event.target.value),
            }}
          >
            {models.map((model) => (
              <option key={model.assetId} value={model.assetId}>
                {model.fileName}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <BimFilters
        key={snapshot.activeModelId}
        catalog={snapshot.catalog}
        visual={snapshot.visual}
        getViewer={getViewer}
      />
    </div>
  );
}
