"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import {
  viewerToolGroups,
  type ViewerPanelId,
  type ViewerToolGroupId,
} from "../model/viewer-tool-catalog";

import styles from "./viewer-tool-bar.module.css";

const primaryGroups = viewerToolGroups.filter(
  (group) =>
    group.id === "measurements" ||
    group.id === "cuts" ||
    group.id === "annotations",
);
const otherGroups = viewerToolGroups.filter(
  (group) =>
    group.id !== "measurements" &&
    group.id !== "cuts" &&
    group.id !== "annotations",
);

export function ViewerToolBar({
  activeGroupId,
  bcfTopicCount,
  onFitToView,
  onSelect,
  rootRef,
}: {
  activeGroupId: ViewerToolGroupId | null;
  bcfTopicCount: number;
  onFitToView: () => void;
  onSelect: (
    panel: ViewerPanelId,
    groupId: ViewerToolGroupId,
    trigger: HTMLButtonElement,
  ) => void;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const menuPrefix = useId();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!openGroup) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenGroup(null);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [openGroup]);

  const select = (panel: ViewerPanelId, groupId: ViewerToolGroupId) => {
    const trigger = triggerRefs.current[groupId] ?? triggerRefs.current.more;
    setOpenGroup(null);
    if (trigger) onSelect(panel, groupId, trigger);
  };

  return (
    <div
      aria-label="Outils de la visionneuse"
      className={styles.root}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !openGroup) return;
        event.preventDefault();
        triggerRefs.current[openGroup]?.focus();
        setOpenGroup(null);
      }}
      ref={(element) => {
        barRef.current = element;
        rootRef.current = element;
      }}
      role="group"
    >
      <ul className={styles.list}>
        <li className={styles.item}>
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
        {primaryGroups.map((group) => {
          const hasMenu = group.actions.length > 1;
          const expanded = openGroup === group.id;
          const isActive = group.id === activeGroupId;
          return (
            <li className={styles.item} key={group.id}>
              <Button
                className={styles.trigger}
                iconId={group.icon}
                nativeButtonProps={{
                  "aria-label":
                    group.id === "annotations" && bcfTopicCount > 0
                      ? `${group.label} (${bcfTopicCount})`
                      : group.label,
                  "aria-controls": hasMenu
                    ? `${menuPrefix}-viewer-tools-${group.id}`
                    : undefined,
                  "aria-expanded": hasMenu ? expanded : undefined,
                  "data-active": isActive || undefined,
                }}
                onClick={() => {
                  if (hasMenu) {
                    setOpenGroup(expanded ? null : group.id);
                  } else {
                    select(group.actions[0].panel, group.id);
                  }
                }}
                ref={(element) => {
                  triggerRefs.current[group.id] = element;
                }}
                priority="tertiary no outline"
                size="small"
              >
                <span aria-hidden="true" className={styles.tooltip}>
                  {group.label}
                </span>
                {group.id === "annotations" && bcfTopicCount > 0 ? (
                  <span className={styles.count}>{bcfTopicCount}</span>
                ) : null}
              </Button>
              {hasMenu ? (
                <div
                  className={styles.menu}
                  hidden={!expanded}
                  id={`${menuPrefix}-viewer-tools-${group.id}`}
                >
                  <ul>
                    {group.actions.map((action) => (
                      <li key={action.panel}>
                        <Button
                          className={styles.menuAction}
                          onClick={() => select(action.panel, group.id)}
                          priority="tertiary no outline"
                          size="small"
                        >
                          {action.label}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
        <li className={styles.item}>
          <Button
            className={styles.trigger}
            nativeButtonProps={{
              "aria-label": "Autres outils",
              "aria-controls": `${menuPrefix}-viewer-tools-more`,
              "aria-expanded": openGroup === "more",
              "data-active":
                otherGroups.some((group) => group.id === activeGroupId) ||
                undefined,
            }}
            onClick={() => setOpenGroup(openGroup === "more" ? null : "more")}
            priority="tertiary no outline"
            ref={(element) => {
              triggerRefs.current.more = element;
            }}
            size="small"
          >
            <span aria-hidden="true" className={styles.moreDots}>
              •••
            </span>
            <span aria-hidden="true" className={styles.tooltip}>
              Autres outils
            </span>
          </Button>
          <div
            className={styles.menu}
            hidden={openGroup !== "more"}
            id={`${menuPrefix}-viewer-tools-more`}
          >
            <ul>
              {otherGroups.map((group) => (
                <li key={group.id}>
                  <p className={styles.menuGroupTitle}>{group.label}</p>
                  <ul>
                    {group.actions.map((action) => (
                      <li key={action.panel}>
                        <Button
                          className={styles.menuAction}
                          onClick={() => select(action.panel, group.id)}
                          priority="tertiary no outline"
                          size="small"
                        >
                          {action.label}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </li>
      </ul>
    </div>
  );
}
