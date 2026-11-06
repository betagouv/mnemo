"use client";

import Accordion from "@codegouvfr/react-dsfr/Accordion";
import Alert from "@codegouvfr/react-dsfr/Alert";
import Select from "@codegouvfr/react-dsfr/Select";
import type { IfcViewerSnapshot } from "@mnemo/ifc-viewer-adapter";
import type { useFloorPlans } from "../model/use-floor-plans";
import { FloorPlanRules } from "./floor-plan-rules";
import {
  SavedFloorPlanSelect,
  FloorPlanSaveActions,
} from "./saved-floor-plans";
import styles from "./floor-plan-panel.module.css";
import { FloorPlanStyleSelect } from "./floor-plan-style-select";

export function FloorPlanPanel({
  models,
  controller,
  canManage,
}: {
  models: IfcViewerSnapshot["models"];
  controller: ReturnType<typeof useFloorPlans>;
  canManage: boolean;
}) {
  const {
    pending,
    error,
    open: onOpen,
    selection,
    preset,
    setPreset: onPresetChange,
  } = controller;
  const availableModels = models.filter(
    (model) => model.catalog?.storeys.length,
  );
  function selectLevel(value: string) {
    for (const model of availableModels) {
      const level = model.catalog?.storeys.find(
        (storey) => `${model.assetId}/${storey.expressId}` === value,
      );
      if (level) {
        void onOpen(model.assetId, level.expressId, level.name);
        return;
      }
    }
  }

  if (!availableModels.length)
    return (
      <p className="p-4">
        Aucun niveau IFC disponible. Chargez une maquette contenant des niveaux.
      </p>
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`${styles.fields} flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4`}
      >
        <SavedFloorPlanSelect controller={controller} />
        <Select
          className="mb-0"
          label="Niveau"
          hint="Coupe à 1,20 m au-dessus du niveau."
          nativeSelectProps={{
            "aria-label": "Niveau",
            value: selection,
            disabled: pending,
            onChange: (event) => selectLevel(event.target.value),
          }}
        >
          <option value="" disabled>
            Choisir un niveau
          </option>
          {availableModels.map((model) => (
            <optgroup key={model.assetId} label={model.fileName}>
              {model.catalog?.storeys.map((storey) => (
                <option
                  key={storey.expressId}
                  value={`${model.assetId}/${storey.expressId}`}
                  disabled={storey.elevation === null}
                >
                  {storey.name}
                  {storey.elevation === null ? " — altitude indisponible" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <FloorPlanStyleSelect value={preset} onChange={onPresetChange} />
        <Accordion label={`Règles personnalisées (${controller.rules.length})`}>
          <FloorPlanRules
            rules={controller.rules}
            classes={controller.classes}
            onChange={controller.setRules}
          />
        </Accordion>
        {pending ? (
          <p className="mb-0 mt-4 text-sm" role="status">
            Génération du plan…
          </p>
        ) : null}
        {error ? (
          <Alert className="mt-4" small severity="error" description={error} />
        ) : null}
      </div>
      {canManage && controller.plan ? (
        <FloorPlanSaveActions
          key={controller.saved.selected?.id ?? "new"}
          controller={controller}
        />
      ) : null}
    </div>
  );
}
