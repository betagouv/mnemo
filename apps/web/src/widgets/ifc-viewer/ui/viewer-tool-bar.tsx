"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";

import {
  viewerToolGroups,
  type ViewerPanelId,
  type ViewerToolGroupId,
} from "../model/viewer-tool-catalog";

import styles from "./viewer-tool-bar.module.css";

export function ViewerToolBar({
  activeGroupId,
  bcfTopicCount,
  onSelect,
  rootRef,
}: {
  activeGroupId: ViewerToolGroupId | null;
  bcfTopicCount: number;
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
    const trigger = triggerRefs.current[groupId];
    setOpenGroup(null);
    if (trigger) onSelect(panel, groupId, trigger);
  };

  return (
    <div
      aria-label="Outils de la visionneuse"
      className="relative z-[5] flex min-h-0 min-w-0 items-center border-b border-[var(--viewer-border)] bg-white px-3.5 py-1.5 [container-type:inline-size] max-[769px]:px-1"
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
      <ul
        className={`${styles.list} m-0 flex w-full list-none flex-nowrap items-center gap-1.5 p-0`}
      >
        {viewerToolGroups.map((group) => {
          const hasMenu = group.actions.length > 1;
          const expanded = openGroup === group.id;
          const isActive = group.id === activeGroupId;
          return (
            <li className="relative m-0 p-0 last:ml-auto" key={group.id}>
              <button
                aria-label={
                  group.id === "annotations" && bcfTopicCount > 0
                    ? `${group.label} (${bcfTopicCount})`
                    : group.label
                }
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
