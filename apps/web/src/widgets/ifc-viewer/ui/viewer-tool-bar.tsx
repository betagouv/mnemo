"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";

import {
  viewerToolGroups,
  type ViewerPanelId,
} from "../model/viewer-tool-catalog";

import styles from "./viewer-tool-bar.module.css";

export function ViewerToolBar({
  activePanel,
  bcfTopicCount,
  onSelect,
  rootRef,
}: {
  activePanel: ViewerPanelId | null;
  bcfTopicCount: number;
  onSelect: (panel: ViewerPanelId, trigger: HTMLButtonElement) => void;
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

  const select = (panel: ViewerPanelId, groupId: string) => {
    const trigger = triggerRefs.current[groupId];
    setOpenGroup(null);
    if (trigger) onSelect(panel, trigger);
  };

  return (
    <div
      aria-label="Outils de la visionneuse"
      className={styles.bar}
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
        {viewerToolGroups.map((group) => {
          const hasMenu = group.actions.length > 1;
          const expanded = openGroup === group.id;
          const isActive = group.actions.some(
            (action) => action.panel === activePanel,
          );
          return (
            <li className={styles.item} key={group.id}>
              <button
                aria-controls={
                  hasMenu ? `${menuPrefix}-viewer-tools-${group.id}` : undefined
                }
                aria-expanded={hasMenu ? expanded : undefined}
                className={`fr-btn fr-btn--sm fr-btn--tertiary-no-outline ${styles.trigger}`}
                data-active={isActive || undefined}
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
                title={group.label}
                type="button"
              >
                <span aria-hidden="true" className={group.icon} />
                <span className={styles.triggerLabel}>{group.label}</span>
                {group.id === "annotations" && bcfTopicCount > 0 ? (
                  <span className={styles.count}>{bcfTopicCount}</span>
                ) : null}
                {hasMenu ? (
                  <span
                    aria-hidden="true"
                    className="fr-icon-arrow-down-s-line"
                  />
                ) : null}
              </button>
              {hasMenu ? (
                <div
                  className={styles.menu}
                  hidden={!expanded}
                  id={`${menuPrefix}-viewer-tools-${group.id}`}
                >
                  <ul>
                    {group.actions.map((action) => (
                      <li key={action.panel}>
                        <button
                          className={styles.menuAction}
                          onClick={() => select(action.panel, group.id)}
                          type="button"
                        >
                          {action.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
