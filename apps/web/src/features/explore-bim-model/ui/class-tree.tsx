"use client";

import type { BimViewer } from "../model/viewer-target";
import {
  type BimLayerTarget,
  type IfcElementSummary,
} from "@mnemo/ifc-viewer-adapter";
import { useEffect, useRef, useState } from "react";
import { VisibilityCheckbox } from "@/shared/ui/visibility-checkbox";
import { useSelectionExpansion } from "../model/use-selection-expansion";
import styles from "./bim-layer-tree.module.css";

export function ClassTree({
  assetId,
  count,
  getViewer,
  ifcClass,
  storeyId,
  selection,
  selectedElements,
}: {
  assetId: string;
  count: number;
  getViewer: () => BimViewer | null;
  ifcClass: string;
  storeyId: number | null;
  selection: IfcElementSummary | null;
  selectedElements: IfcElementSummary[];
}) {
  const [expanded, setExpanded] = useSelectionExpansion(selection);
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (expanded && selection)
      selectedRef.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
  }, [expanded, selection]);
  const [limit, setLimit] = useState(50);
  const viewer = getViewer();
  const target: BimLayerTarget = { kind: "class", storeyId, ifcClass };
  const mode = viewer?.getLayerVisibility(assetId, target) ?? "show";
  const exceptions = viewer?.getLayerExceptionCount(assetId, target) ?? 0;
  const page: IfcElementSummary[] = expanded
    ? (viewer?.getBimElements(assetId, storeyId, 0, limit, ifcClass) ?? [])
    : [];
  const selectedIds = new Set(
    selectedElements.map((element) => element.expressId),
  );
  const pageIds = new Set(page.map((element) => element.expressId));
  const elements = [
    ...page,
    ...selectedElements.filter((element) => !pageIds.has(element.expressId)),
  ];

  return (
    <div
      className={styles.classGroup}
      data-mode={mode}
      data-exceptions={exceptions > 0}
    >
      <VisibilityCheckbox
        exceptionCount={exceptions}
        label={ifcClass}
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
        <span title={ifcClass}>{ifcClass}</span>
        {exceptions > 0 ? <em className={styles.exception}>Mixte</em> : null}
        <small>{count.toLocaleString("fr-FR")}</small>
      </button>
      {expanded ? (
        <div className={styles.elements}>
          {elements.map((element) => {
            const elementTarget: BimLayerTarget = {
              kind: "element",
              expressId: element.expressId,
            };
            const label =
              element.name || `${element.ifcClass} #${element.expressId}`;
            return (
              <div
                className={styles.element}
                data-selected={selectedIds.has(element.expressId)}
                key={element.expressId}
              >
                <VisibilityCheckbox
                  label={label}
                  mode={
                    viewer?.getLayerVisibility(assetId, elementTarget) ?? "show"
                  }
                  onChange={(next) =>
                    viewer?.setLayerVisibility(assetId, elementTarget, next)
                  }
                />
                <button
                  className={styles.elementName}
                  aria-pressed={selectedIds.has(element.expressId)}
                  aria-current={
                    element.expressId === selection?.expressId
                      ? "true"
                      : undefined
                  }
                  ref={
                    element.expressId === selection?.expressId
                      ? selectedRef
                      : undefined
                  }
                  onClick={(event) =>
                    viewer?.selectModelEntity(
                      assetId,
                      element.expressId,
                      event.ctrlKey || event.metaKey,
                    )
                  }
                  title={`${label} · ${element.ifcClass} · #${element.expressId}`}
                  type="button"
                >
                  {label}
                </button>
              </div>
            );
          })}
          {page.length < count ? (
            <button
              className={styles.more}
              onClick={() => setLimit(limit + 50)}
              type="button"
            >
              Afficher 50 éléments de plus
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
