"use client";
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

export function BimFilterPanel({
  snapshot,
  sources,
  getViewer,
  projectId,
  initial,
  canSave,
  onActiveGroupCountChange,
  ref,
}: {
  snapshot: IfcViewerSnapshot;
  sources: { assetId: string; fileName: string }[];
  getViewer: () => BimFilterViewer | null;
  projectId: string;
  initial: SavedBimFilters | null;
  canSave: boolean;
  onActiveGroupCountChange: (count: number) => void;
  ref?: Ref<BimFilterControls>;
}) {
  const persistence = useSavedBimFilters(projectId, initial);
  const models = useMemo(
    () =>
      sources.map((source) => ({
        ...source,
        catalog: snapshot.models.find(
          (model) =>
            model.assetId === source.assetId && model.phase === "ready",
        )?.catalog,
      })),
    [sources, snapshot.models],
  );
  const settled = sources.every((source) =>
    snapshot.models.some(
      (model) =>
        model.assetId === source.assetId &&
        (model.phase === "ready" || model.phase === "error"),
    ),
  );
  const defaults = useMemo(
    () => (settled ? createBimFilterSettings(models) : null),
    [settled, models],
  );
  const settings = persistence.draft ?? persistence.saved?.settings ?? defaults;
  const count = settings ? countActiveBimFilterGroups(settings) : 0;
  useEffect(() => {
    onActiveGroupCountChange(count);
  }, [count, onActiveGroupCountChange]);
  if (!sources.length)
    return (
      <p className="p-4">Ajoutez une maquette IFC pour utiliser les filtres.</p>
    );
  if (settled && !models.some((model) => model.catalog))
    return (
      <p className="p-4" role="status">
        Aucune maquette IFC disponible. Réessayez le chargement pour utiliser
        les filtres.
      </p>
    );
  if (!settings || !models.some((model) => model.catalog))
    return (
      <p className="p-4" role="status">
        Lecture des maquettes IFC…
      </p>
    );
  return (
    <BimFilters
      ref={ref}
      models={models}
      getViewer={getViewer}
      initial={settings}
      saved={persistence.saved?.settings}
      hasDraft={Boolean(persistence.draft)}
      canSave={canSave}
      busy={persistence.busy}
      message={persistence.message}
      onChange={persistence.update}
      onSave={persistence.save}
    />
  );
}
