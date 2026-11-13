"use client";

import { useId, useMemo, useState } from "react";
import Button from "@codegouvfr/react-dsfr/Button";
import { SegmentedControl } from "@codegouvfr/react-dsfr/SegmentedControl";
import { hasBimFilterCriteria } from "@mnemo/contracts/bim-filters";
import {
  queryForBimFilterModel,
  type BimFilterModel,
} from "../model/bim-filter-model";
import { MultiSelect } from "@/shared/ui/multi-select";
import type { BimFilterDraft } from "../model/bim-filter-rules";
import type { BimFilterViewer } from "../model/viewer-target";
import styles from "./bim-filter-panel.module.css";

export function BimFilterEditor({
  models,
  initial,
  getViewer,
  onSave,
  onCancel,
  editing = false,
  autoFocus = false,
}: {
  models: BimFilterModel[];
  initial?: BimFilterDraft;
  getViewer: () => BimFilterViewer | null;
  onSave: (draft: BimFilterDraft) => void;
  onCancel: () => void;
  editing?: boolean;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState<BimFilterDraft>(
    initial ?? {
      query: { ifcClasses: [], storeys: [] },
      action: "isolate",
      color: "#6a6af4",
    },
  );
  const colorId = useId();
  const classes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of models)
      for (const type of model.catalog?.types ?? [])
        counts.set(
          type.ifcClass,
          (counts.get(type.ifcClass) ?? 0) + type.elementCount,
        );
    return [...counts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, count]) => ({
        value: name,
        label: name,
        detail: count.toLocaleString("fr-FR"),
      }));
  }, [models]);
  const levels = useMemo(
    () =>
      models.flatMap((model) =>
        (model.catalog?.storeys ?? []).map((level) => ({
          value: `${model.assetId}:${level.expressId}`,
          label: `${level.name} · ${model.fileName}`,
        })),
      ),
    [models],
  );
  const viewer = getViewer();
  const matches = models.reduce((count, model) => {
    const query = queryForBimFilterModel(draft.query, model.assetId);
    return count + (query ? (viewer?.countBim(query, model.assetId) ?? 0) : 0);
  }, 0);
  const hasCriteria = hasBimFilterCriteria(draft.query);
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
        value={draft.query.storeys.map(
          (level) => `${level.assetId}:${level.storeyId}`,
        )}
        placeholder="Tous les niveaux"
        disabled={!levels.length}
        onChange={(values) =>
          setDraft({
            ...draft,
            query: {
              ...draft.query,
              storeys: values.map((value) => {
                const [assetId, storeyId] = value.split(":");
                return { assetId, storeyId: Number(storeyId) };
              }),
            },
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
