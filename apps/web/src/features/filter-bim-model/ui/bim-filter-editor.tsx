"use client";

import { useId, useMemo, useState } from "react";
import Button from "@codegouvfr/react-dsfr/Button";
import { SegmentedControl } from "@codegouvfr/react-dsfr/SegmentedControl";
import type { IfcBimCatalog } from "@mnemo/ifc-viewer-adapter";
import { MultiSelect } from "@/shared/ui/multi-select";
import type { BimFilterDraft } from "../model/bim-filter-rules";
import type { BimFilterViewer } from "../model/viewer-target";
import styles from "./bim-filter-panel.module.css";

export function BimFilterEditor({
  catalog,
  initial,
  getViewer,
  onSave,
  onCancel,
  editing = false,
  autoFocus = false,
}: {
  catalog: IfcBimCatalog;
  initial?: BimFilterDraft;
  getViewer: () => BimFilterViewer | null;
  onSave: (draft: BimFilterDraft) => void;
  onCancel: () => void;
  editing?: boolean;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState<BimFilterDraft>(
    initial ?? {
      query: { ifcClasses: [], storeyIds: [] },
      action: "isolate",
      color: "#6a6af4",
    },
  );
  const colorId = useId();
  const classes = useMemo(
    () =>
      catalog.types.map((type) => ({
        value: type.ifcClass,
        label: type.ifcClass,
        detail: type.elementCount.toLocaleString("fr-FR"),
      })),
    [catalog],
  );
  const levels = useMemo(
    () =>
      catalog.storeys.map((level) => ({
        value: String(level.expressId),
        label: level.name,
      })),
    [catalog],
  );
  const matches = getViewer()?.countBim(draft.query) ?? 0;
  const hasCriteria = Boolean(
    draft.query.ifcClasses?.length || draft.query.storeyIds?.length,
  );
  return (
    <form
      className={styles.editor}
      aria-label={editing ? "Modifier un filtre" : "Ajouter un filtre"}
      onSubmit={(event) => {
        event.preventDefault();
        if (hasCriteria && matches > 0) onSave(draft);
      }}
    >
      <div className={styles.editorHeading}>
        <h3>{editing ? "Modifier le filtre" : "Nouveau filtre"}</h3>
        <Button
          type="button"
          title="Annuler le filtre"
          size="small"
          priority="tertiary no outline"
          iconId="fr-icon-close-line"
          onClick={onCancel}
        />
      </div>
      <MultiSelect
        label="Classes IFC"
        showSelectedChips
        autoFocus={autoFocus}
        options={classes}
        value={Array.from(draft.query.ifcClasses ?? [])}
        placeholder="Toutes les classes"
        onChange={(ifcClasses) =>
          setDraft({ ...draft, query: { ...draft.query, ifcClasses } })
        }
      />
      <MultiSelect
        label="Niveaux"
        showSelectedChips
        options={levels}
        value={(draft.query.storeyIds ?? []).map(String)}
        placeholder="Tous les niveaux"
        disabled={!levels.length}
        onChange={(values) =>
          setDraft({
            ...draft,
            query: { ...draft.query, storeyIds: values.map(Number) },
          })
        }
      />
      <SegmentedControl
        className={styles.actionPicker}
        legend="Action du filtre"
        hideLegend
        small
        segments={[
          {
            label: "Isoler",
            nativeInputProps: {
              checked: draft.action === "isolate",
              onChange: () => setDraft({ ...draft, action: "isolate" }),
            },
          },
          {
            label: "Masquer",
            nativeInputProps: {
              checked: draft.action === "hide",
              onChange: () => setDraft({ ...draft, action: "hide" }),
            },
          },
          {
            label: "Coloriser",
            nativeInputProps: {
              checked: draft.action === "color",
              onChange: () => setDraft({ ...draft, action: "color" }),
            },
          },
        ]}
      />
      {draft.action === "color" ? (
        <div className={styles.colorField}>
          <label htmlFor={colorId}>Couleur</label>
          <input
            className={styles.color}
            id={colorId}
            type="color"
            value={draft.color}
            onChange={(event) =>
              setDraft({ ...draft, color: event.target.value })
            }
          />
        </div>
      ) : null}
      <div className={styles.editorFooter}>
        <span className={styles.hint} role="status">
          {hasCriteria
            ? `${matches.toLocaleString("fr-FR")} élément${matches > 1 ? "s" : ""}`
            : "Choisir une classe ou un niveau"}
        </span>
        <Button
          size="small"
          type="submit"
          disabled={!hasCriteria || matches === 0}
        >
          {editing ? "Enregistrer" : "Ajouter le filtre"}
        </Button>
      </div>
    </form>
  );
}
