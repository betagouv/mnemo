"use client";
import { useId, useImperativeHandle, useState, type Ref } from "react";
import Button from "@codegouvfr/react-dsfr/Button";
import Alert from "@codegouvfr/react-dsfr/Alert";
import type { IfcBimCatalog } from "@mnemo/ifc-viewer-adapter";
import {
  bimFilterSettingsSchema,
  type BimFilterSettings,
} from "@mnemo/contracts/bim-filters";
import type { BimFilterViewer } from "../model/viewer-target";
import { useBimFilterRules } from "../model/use-bim-filter-rules";
import type { BimFilterControls } from "../model/bim-filter-controls";
import { duplicateBimFilterGroup } from "../model/bim-filter-groups";
import { BimFilterGroup } from "./bim-filter-group";
import { BimFilterGroupName } from "./bim-filter-group-name";
import { BimFilterContext } from "./bim-filter-context";
import styles from "./bim-filter-panel.module.css";

export function BimFilters({
  catalog,
  assetId,
  getViewer,
  initial,
  saved,
  hasDraft,
  canSave,
  busy,
  message,
  onChange,
  onSave,
  ref,
}: {
  catalog: IfcBimCatalog;
  assetId: string;
  getViewer: () => BimFilterViewer | null;
  initial: BimFilterSettings;
  saved?: BimFilterSettings;
  hasDraft: boolean;
  canSave: boolean;
  busy: boolean;
  message?: { error: boolean; text: string } | null;
  onChange: (settings: BimFilterSettings) => void;
  onSave: (settings: BimFilterSettings) => void;
  ref?: Ref<BimFilterControls>;
}) {
  const { settings, changeGroups, changeContext, resetVisuals } =
    useBimFilterRules(getViewer, assetId, initial, onChange);
  useImperativeHandle(ref, () => ({ resetVisuals }), [resetVisuals]);
  const [adding, setAdding] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const contextId = useId();
  const validated = bimFilterSettingsSchema.safeParse(settings);
  const previous = bimFilterSettingsSchema.safeParse(saved ?? initial);
  const dirty =
    !validated.success ||
    !previous.success ||
    (saved
      ? JSON.stringify(validated.data) !== JSON.stringify(previous.data)
      : hasDraft);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={styles.workspaceHeading}>
        <span className={styles.hint}>
          Les groupes et leurs filtres se cumulent.
        </span>
        <Button
          size="small"
          priority="tertiary no outline"
          iconId={
            contextOpen ? "fr-icon-settings-5-fill" : "fr-icon-settings-5-line"
          }
          title="Réglages du contexte"
          nativeButtonProps={{
            "aria-expanded": contextOpen,
            "aria-controls": contextId,
          }}
          onClick={() => setContextOpen(!contextOpen)}
        />
      </div>
      <fieldset disabled={busy} className={styles.workspace}>
        <legend className="fr-sr-only">Groupes de filtres</legend>
        <div id={contextId} hidden={!contextOpen}>
          <BimFilterContext settings={settings} onChange={changeContext} />
        </div>
        {settings.groups.map((group) => (
          <BimFilterGroup
            key={group.id}
            group={group}
            catalog={catalog}
            getViewer={getViewer}
            onChange={(updated) =>
              changeGroups(
                settings.groups.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              )
            }
            onDuplicate={() =>
              changeGroups([...settings.groups, duplicateBimFilterGroup(group)])
            }
            onRemove={() =>
              changeGroups(
                settings.groups.filter((item) => item.id !== group.id),
              )
            }
          />
        ))}
        {adding ? (
          <BimFilterGroupName
            onCancel={() => setAdding(false)}
            onSave={(name) => {
              changeGroups([
                ...settings.groups,
                { id: crypto.randomUUID(), name, enabled: true, rules: [] },
              ]);
              setAdding(false);
            }}
          />
        ) : (
          <Button
            size="small"
            priority="secondary"
            iconId="fr-icon-add-line"
            className={styles.addButton}
            onClick={() => setAdding(true)}
          >
            Créer un groupe
          </Button>
        )}
      </fieldset>
      <footer className={styles.saveBar}>
        {!validated.success ? (
          <Alert
            small
            severity="error"
            description="Vérifiez les filtres. Limite de 50 groupes et 500 filtres par maquette."
          />
        ) : null}
        {message?.error ? (
          <Alert small severity="error" description={message.text} />
        ) : null}
        <span className={styles.hint} role="status">
          {busy
            ? "Enregistrement…"
            : dirty
              ? "Modifications non enregistrées"
              : (message?.text ?? "Filtres partagés dans le dossier")}
        </span>
        {canSave ? (
          <Button
            size="small"
            iconId="fr-icon-save-line"
            disabled={!dirty || busy || !validated.success}
            onClick={() => onSave(settings)}
          >
            Enregistrer
          </Button>
        ) : (
          <span className={styles.hint}>
            Activation locale. L’enregistrement nécessite le droit de modifier
            le dossier.
          </span>
        )}
      </footer>
    </div>
  );
}
