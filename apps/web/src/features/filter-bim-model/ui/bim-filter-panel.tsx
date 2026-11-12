"use client";
import Select from "@codegouvfr/react-dsfr/Select";
import { useEffect, useMemo, type Ref } from "react";
import type { IfcViewerSnapshot } from "@mnemo/ifc-viewer-adapter";
import type { SavedBimFilters } from "@mnemo/contracts/bim-filters";
import type { BimFilterViewer } from "../model/viewer-target";
import {
  countActiveBimFilterGroups,
  createBimFilterSettings,
} from "../model/bim-filter-groups";
import { useSavedBimFilters } from "../model/use-saved-bim-filters";
import { BimFilters } from "./bim-filters";
import type { BimFilterControls } from "../model/bim-filter-controls";
import styles from "./bim-filter-panel.module.css";

export function BimFilterPanel({
  snapshot,
  getViewer,
  projectId,
  initial,
  canSave,
  onActiveGroupCountChange,
  ref,
}: {
  snapshot: IfcViewerSnapshot;
  getViewer: () => BimFilterViewer | null;
  projectId: string;
  initial: SavedBimFilters[];
  canSave: boolean;
  onActiveGroupCountChange: (count: number) => void;
  ref?: Ref<BimFilterControls>;
}) {
  const persistence = useSavedBimFilters(projectId, initial);
  const defaults = useMemo(
    () => (snapshot.catalog ? createBimFilterSettings(snapshot.catalog) : null),
    [snapshot.catalog],
  );
  const assetId = snapshot.activeModelId;
  const settings = assetId
    ? (persistence.drafts[assetId] ??
      persistence.saved[assetId]?.settings ??
      defaults)
    : null;
  const activeGroupCount = settings ? countActiveBimFilterGroups(settings) : 0;
  useEffect(() => {
    onActiveGroupCountChange(activeGroupCount);
  }, [activeGroupCount, onActiveGroupCountChange]);
  if (!snapshot.catalog || !assetId || !defaults)
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
              value: assetId,
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
        ref={ref}
        key={assetId}
        assetId={assetId}
        catalog={snapshot.catalog}
        getViewer={getViewer}
        initial={settings ?? defaults}
        saved={persistence.saved[assetId]?.settings}
        hasDraft={Boolean(persistence.drafts[assetId])}
        canSave={canSave}
        busy={persistence.busy}
        message={
          persistence.message?.assetId === assetId ? persistence.message : null
        }
        onChange={(settings) => persistence.update(assetId, settings)}
        onSave={(settings) => persistence.save(assetId, settings)}
      />
    </div>
  );
}
