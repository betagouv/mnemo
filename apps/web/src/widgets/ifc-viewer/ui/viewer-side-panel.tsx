"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import { useEffect, useId, useRef, type ReactNode } from "react";

import styles from "./viewer-side-panel.module.css";

export function ViewerSidePanel({
  children,
  focusRequest,
  iconClass,
  isOpen,
  mode,
  onClose,
  title,
  pinned = false,
  docked = false,
  onPin,
}: {
  children: ReactNode;
  focusRequest: number;
  iconClass?: string;
  isOpen: boolean;
  mode?: string;
  onClose: () => void;
  title: string;
  pinned?: boolean;
  docked?: boolean;
  onPin?: () => void;
}) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (isOpen && focusRequest > 0) titleRef.current?.focus();
  }, [focusRequest, isOpen]);

  return (
    <aside
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !(event.target as HTMLElement).closest(
            'input:not([type="radio"]):not([type="checkbox"]), textarea, select',
          )
        ) {
          event.preventDefault();
          onClose();
        }
      }}
      className={`${styles.root} grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] border border-[var(--viewer-border)] bg-[var(--background-default-grey)]`}
      data-pinned={pinned || undefined}
      data-docked={docked || undefined}
      hidden={!isOpen}
    >
      <header
        className={`${styles.header} flex min-h-15 items-center justify-between gap-2 border-b border-[var(--viewer-border)]`}
      >
        <div className={`${styles.heading} flex min-w-0 items-center gap-2`}>
          {iconClass ? <span aria-hidden="true" className={iconClass} /> : null}
          <h2 id={titleId} ref={titleRef} tabIndex={-1}>
            {title}
          </h2>
        </div>
        <div className="flex items-center">
          {onPin ? (
            <Button
              className={styles.pin}
              iconId="ri-pushpin-line"
              size="small"
              priority="tertiary no outline"
              title={
                pinned ? "Désépingler les maquettes" : "Épingler les maquettes"
              }
              nativeButtonProps={{ "aria-pressed": pinned }}
              onClick={onPin}
            />
          ) : null}
          <Button
            iconId="fr-icon-close-line"
            onClick={onClose}
            priority="tertiary no outline"
            size="small"
            title="Fermer le panneau"
          />
        </div>
      </header>
      <div className={`${styles.body} min-h-0 overflow-auto`} data-mode={mode}>
        {children}
      </div>
    </aside>
  );
}
