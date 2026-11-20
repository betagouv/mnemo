"use client";

import Accordion from "@codegouvfr/react-dsfr/Accordion";
import Button from "@codegouvfr/react-dsfr/Button";
import Alert from "@codegouvfr/react-dsfr/Alert";
import { FloorPlanLevels } from "./floor-plan-levels";
import type { IfcViewerSnapshot } from "@mnemo/ifc-viewer-adapter";
import type { useFloorPlans } from "../model/use-floor-plans";
import { FloorPlanRules } from "./floor-plan-rules";
import { FloorPlanSaveActions } from "./saved-floor-plans";
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
  const { pending, error, preset, setPreset: onPresetChange } = controller;
  const availableModels = models.filter(
    (model) => model.catalog?.storeys.length,
  );
  if (!availableModels.length)
    return (
      <p className="p-4">
        Aucun niveau IFC disponible. Chargez une maquette contenant des niveaux.
      </p>
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
        <FloorPlanLevels models={availableModels} controller={controller} />
        {pending ? (
          <div className={styles.loading}>
            <div className={styles.loadingStatus} role="status">
              <span
                className={`fr-icon-refresh-line ${styles.spinner}`}
                aria-hidden="true"
              />
              <span>Préparation du plan…</span>
            </div>
            <Button
              size="small"
              priority="tertiary no outline"
              iconId="fr-icon-close-line"
              title="Annuler la génération du plan"
              onClick={controller.cancel}
            >
              Annuler
            </Button>
          </div>
        ) : null}
        {error ? (
          <Alert severity="error" title="Plan non généré" description={error} />
        ) : null}
        {controller.plan && (
          <Accordion label="Apparence du plan">
            <FloorPlanStyleSelect value={preset} onChange={onPresetChange} />
            <Accordion
              label={`Règles personnalisées (${controller.rules.length})`}
            >
              <FloorPlanRules
                rules={controller.rules}
                classes={controller.classes}
                onChange={controller.setRules}
              />
            </Accordion>
          </Accordion>
        )}
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
