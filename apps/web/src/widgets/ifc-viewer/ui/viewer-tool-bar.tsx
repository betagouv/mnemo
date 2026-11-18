"use client";
import Button from "@codegouvfr/react-dsfr/Button";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  viewerToolGroups,
  viewerSecondaryTools,
  type ViewerPanelId,
  type ViewerToolGroupId,
} from "../model/viewer-tool-catalog";
import { viewerIconClass } from "./viewer-icon";
import styles from "./viewer-tool-bar.module.css";
export function ViewerToolBar({
  activeGroupId,
  activeFilterGroupCount,
  bcfTopicCount,
  layerCount,
  canReadBcf,
  sectionActive,
  onSelect,
  rootRef,
}: {
  activeGroupId: ViewerToolGroupId | null;
  activeFilterGroupCount: number;
  bcfTopicCount: number;
  layerCount: number;
  canReadBcf: boolean;
  sectionActive: boolean;
  onSelect: (
    panel: ViewerPanelId,
    groupId: ViewerToolGroupId,
    trigger: HTMLButtonElement,
  ) => void;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const menuId = useId();
  const filterCountId = `${menuId}-filter-count`;
  const counts: Partial<Record<ViewerToolGroupId, number>> = {
    layers: layerCount,
    annotations: bcfTopicCount,
    filters: activeFilterGroupCount,
  };
  const moreRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [moreOpen]);
  return (
    <div
      aria-label="Outils de la visionneuse"
      className={styles.root}
      ref={rootRef}
      role="group"
    >
      <span id={filterCountId} className="fr-sr-only">
        {activeFilterGroupCount} groupe{activeFilterGroupCount > 1 ? "s" : ""}{" "}
        de filtres actif{activeFilterGroupCount > 1 ? "s" : ""}
      </span>
      <ul className={styles.list}>
        {viewerToolGroups
          .filter((group) => canReadBcf || group.id !== "annotations")
          .map((group) => {
            const count = counts[group.id] ?? 0;
            return (
              <li
                className={styles.item}
                key={group.id}
                data-separated={group.id === "layers" || undefined}
              >
                <Button
                  className={`${styles.trigger} ${viewerIconClass(group.icon)}`}
                  nativeButtonProps={{
                    "aria-label": group.label,
                    "aria-describedby":
                      group.id === "filters" ? filterCountId : undefined,
                    "data-tool-group": group.id,
                    "aria-pressed": activeGroupId === group.id,
                    "data-active": activeGroupId === group.id || undefined,
                    "data-effect-active":
                      (group.id === "cuts" && sectionActive) || undefined,
                  }}
                  onClick={(event) =>
                    onSelect(group.panel, group.id, event.currentTarget)
                  }
                  priority="tertiary no outline"
                  size="small"
                >
                  <span aria-hidden="true" className={styles.tooltip}>
                    {group.label}
                  </span>
                  {count > 0 ? (
                    <span aria-hidden="true" className={styles.count}>
                      {count}
                    </span>
                  ) : null}
                  {group.id === "cuts" && sectionActive ? (
                    <span
                      className={styles.activeDot}
                      aria-label="Coupe active"
                    />
                  ) : null}
                </Button>
              </li>
            );
          })}
        <li
          className={styles.item}
          data-separated="true"
          ref={moreRef}
          onKeyDown={(event) => {
            if (event.key === "Escape" && moreOpen) {
              event.preventDefault();
              setMoreOpen(false);
              moreRef.current?.querySelector("button")?.focus();
            }
          }}
        >
          <Button
            className={styles.trigger}
            iconId="fr-icon-more-fill"
            nativeButtonProps={{
              "aria-label": "Autres outils",
              "aria-expanded": moreOpen,
              "aria-controls": menuId,
              "data-active":
                activeGroupId === "help" ||
                activeGroupId === "information" ||
                undefined,
            }}
            onClick={() => setMoreOpen(!moreOpen)}
            priority="tertiary no outline"
            size="small"
          >
            <span aria-hidden="true" className={styles.tooltip}>
              Autres outils
            </span>
          </Button>
          <div className={styles.menu} hidden={!moreOpen} id={menuId}>
            {viewerSecondaryTools.map((tool) => (
              <Button
                key={tool.id}
                iconId={tool.icon}
                size="small"
                priority="tertiary no outline"
                onClick={() => {
                  const trigger = moreRef.current?.querySelector("button");
                  setMoreOpen(false);
                  if (trigger) onSelect(tool.panel, tool.id, trigger);
                }}
              >
                {tool.label}
              </Button>
            ))}
          </div>
        </li>
      </ul>
    </div>
  );
}
