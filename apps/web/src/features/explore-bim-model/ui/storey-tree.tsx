"use client";

import type { BimViewer } from "../model/viewer-target";
import {
  type BimLayerTarget,
  type IfcElementSummary,
} from "@mnemo/ifc-viewer-adapter";
import { VisibilityCheckbox } from "@/shared/ui/visibility-checkbox";
import { useSelectionExpansion } from "../model/use-selection-expansion";
import styles from "./bim-layer-tree.module.css";
import { ClassTree } from "./class-tree";

export function StoreyTree({
  assetId,
  name,
  count,
  storeyId,
  getViewer,
  selection,
  selectedElements,
}: {
  assetId: string;
  name: string;
  count: number;
  storeyId: number | null;
  getViewer: () => BimViewer | null;
  selection: IfcElementSummary | null;
  selectedElements: IfcElementSummary[];
}) {
  const [expanded, setExpanded] = useSelectionExpansion(selection);
  const viewer = getViewer();
  const target: BimLayerTarget =
    storeyId === null
      ? { kind: "unassigned" }
      : { kind: "storey", expressId: storeyId };
  const mode = viewer?.getLayerVisibility(assetId, target) ?? "show";
  const exceptions = viewer?.getLayerExceptionCount(assetId, target) ?? 0;
  const classes = expanded
    ? (viewer?.getBimClasses(assetId, storeyId) ?? [])
    : [];

  return (
    <div
      className={styles.storey}
      data-mode={mode}
      data-exceptions={exceptions > 0}
    >
      <VisibilityCheckbox
        exceptionCount={exceptions}
        label={name}
        mode={mode}
        onChange={(next) => viewer?.setLayerVisibility(assetId, target, next)}
      />
      <button
        aria-expanded={expanded}
        className={styles.treeToggle}
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <span className={styles.chevron} aria-hidden="true">
          {expanded ? "⌄" : "›"}
        </span>
        <span title={name}>{name}</span>
        {exceptions > 0 ? <em className={styles.exception}>Mixte</em> : null}
        <small>{count.toLocaleString("fr-FR")}</small>
      </button>
      {expanded ? (
        <div className={styles.groups}>
          {classes.map((entry) => (
            <ClassTree
              assetId={assetId}
              count={entry.elementCount}
              getViewer={getViewer}
              ifcClass={entry.ifcClass}
              key={entry.ifcClass}
              storeyId={storeyId}
              selection={
                selection?.ifcClass === entry.ifcClass ? selection : null
              }
              selectedElements={selectedElements.filter(
                (element) => element.ifcClass === entry.ifcClass,
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
