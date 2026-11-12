"use client";

import { useState } from "react";
import Button from "@codegouvfr/react-dsfr/Button";
import Accordion from "@codegouvfr/react-dsfr/Accordion";
import Checkbox from "@codegouvfr/react-dsfr/Checkbox";
import Range from "@codegouvfr/react-dsfr/Range";
import type {
  IfcBimCatalog,
  IfcVisualSnapshot,
} from "@mnemo/ifc-viewer-adapter";
import type { BimFilterViewer } from "../model/viewer-target";
import { useBimFilterRules } from "../model/use-bim-filter-rules";
import { BimFilterEditor } from "./bim-filter-editor";
import { BimFilterRuleList } from "./bim-filter-rule-list";
import styles from "./bim-filter-panel.module.css";

export function BimFilters({
  catalog,
  visual,
  getViewer,
}: {
  catalog: IfcBimCatalog;
  visual: IfcVisualSnapshot;
  getViewer: () => BimFilterViewer | null;
}) {
  const filters = useBimFilterRules(getViewer, visual);
  const [editor, setEditor] = useState<{
    id: string;
    autoFocus: boolean;
  } | null>({ id: "new", autoFocus: false });
  const editing = filters.rules.find((rule) => rule.id === editor?.id);
  const showEditor = editor?.id === "new" || Boolean(editing);
  const hasIsolation =
    filters.rules.some((rule) => rule.enabled && rule.action === "isolate") ||
    visual.mode === "isolate";
  return (
    <div
      className={`${styles.fields} flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4`}
    >
      <div className={styles.listHeading}>
        <h3>Filtres ({filters.rules.length})</h3>
        {filters.rules.length || visual.mode !== "all" ? (
          <Button
            size="small"
            priority="tertiary no outline"
            iconId="fr-icon-refresh-line"
            title="Réinitialiser les filtres"
            onClick={() => {
              filters.reset();
              setEditor({ id: "new", autoFocus: true });
            }}
          />
        ) : null}
      </div>
      <p className={styles.hint}>Les filtres se cumulent dans la scène.</p>
      {filters.rules.length ? (
        <BimFilterRuleList
          rules={filters.rules}
          catalog={catalog}
          onToggle={filters.toggle}
          onEdit={(id) => setEditor({ id, autoFocus: true })}
          onRemove={filters.remove}
        />
      ) : null}
      {showEditor && editing?.action !== "storey-colors" ? (
        <BimFilterEditor
          key={editor?.id}
          catalog={catalog}
          getViewer={getViewer}
          initial={editing}
          editing={Boolean(editing)}
          autoFocus={editor?.autoFocus}
          onCancel={() => setEditor(null)}
          onSave={(draft) => {
            filters.save(draft, editing?.id);
            setEditor(null);
          }}
        />
      ) : (
        <Button
          className={styles.addButton}
          nativeButtonProps={{ autoFocus: editor === null }}
          size="small"
          priority="secondary"
          iconId="fr-icon-add-line"
          onClick={() => setEditor({ id: "new", autoFocus: true })}
        >
          Ajouter un filtre
        </Button>
      )}
      <Accordion label="Options d’affichage">
        <div className="flex flex-col gap-3">
          <Button
            size="small"
            priority="secondary"
            disabled={!catalog.storeys.length}
            onClick={filters.addStoreyColors}
          >
            Coloriser par niveau
          </Button>
          <Checkbox
            options={[
              {
                label: "Garder le reste en transparence",
                nativeInputProps: {
                  disabled: !hasIsolation,
                  checked: visual.showContext,
                  onChange: (event) =>
                    filters.setContext(
                      event.target.checked,
                      visual.contextOpacity,
                    ),
                },
              },
            ]}
          />
          <Range
            small
            label="Opacité du contexte"
            min={2}
            max={50}
            suffix=" %"
            disabled={!hasIsolation || !visual.showContext}
            nativeInputProps={{
              value: Math.round(visual.contextOpacity * 100),
              onChange: (event) =>
                filters.setContext(
                  visual.showContext,
                  Number(event.target.value) / 100,
                ),
            }}
          />
        </div>
      </Accordion>
    </div>
  );
}
