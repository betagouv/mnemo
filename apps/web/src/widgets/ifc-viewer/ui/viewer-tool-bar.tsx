"use client";
import Button from "@codegouvfr/react-dsfr/Button";
import type { RefObject } from "react";
import {
  viewerToolGroups,
  type ViewerPanelId,
  type ViewerToolGroupId,
} from "../model/viewer-tool-catalog";
import styles from "./viewer-tool-bar.module.css";
export function ViewerToolBar({
  activeGroupId,
  bcfTopicCount,
  layerCount,
  canReadBcf,
  sectionActive,
  onFitToView,
  onSelect,
  rootRef,
}: {
  activeGroupId: ViewerToolGroupId | null;
  bcfTopicCount: number;
  layerCount: number;
  canReadBcf: boolean;
  sectionActive: boolean;
  onFitToView: () => void;
  onSelect: (
    panel: ViewerPanelId,
    groupId: ViewerToolGroupId,
    trigger: HTMLButtonElement,
  ) => void;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      aria-label="Outils de la visionneuse"
      className={styles.root}
      ref={rootRef}
      role="group"
    >
      <ul className={styles.list}>
        {viewerToolGroups
          .filter((group) => canReadBcf || group.id !== "annotations")
          .map((group) => {
            const count =
              group.id === "layers"
                ? layerCount
                : group.id === "annotations"
                  ? bcfTopicCount
                  : 0;
            return (
              <li
                className={styles.item}
                key={group.id}
                data-separated={group.id === "layers" || undefined}
              >
                <Button
                  className={styles.trigger}
                  iconId={group.icon}
                  nativeButtonProps={{
                    "aria-label": group.label,
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
        <li className={styles.item} data-separated="true">
          <Button
            className={styles.trigger}
            iconId="fr-icon-focus-3-line"
            nativeButtonProps={{ "aria-label": "Tout cadrer" }}
            onClick={onFitToView}
            priority="tertiary no outline"
            size="small"
          >
            <span aria-hidden="true" className={styles.tooltip}>
              Tout cadrer
            </span>
          </Button>
        </li>
      </ul>
    </div>
  );
}
