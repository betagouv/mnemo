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
      className={`${styles.root} grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] border border-[var(--viewer-border)] bg-[var(--background-default-grey)]`}
      data-pinned={pinned || undefined}
      data-wide={
        mode === "bcf" ||
        mode === "assistant" ||
        mode === "floor-plan" ||
        undefined
      }
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
