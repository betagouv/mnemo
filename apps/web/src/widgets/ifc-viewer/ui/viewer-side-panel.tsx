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
}: {
  children: ReactNode;
  focusRequest: number;
  iconClass?: string;
  isOpen: boolean;
  mode?: string;
  onClose: () => void;
  title: string;
}) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (isOpen && focusRequest > 0) titleRef.current?.focus();
  }, [focusRequest, isOpen]);

  return (
    <aside
      aria-labelledby={titleId}
      className={`${styles.root} z-[2] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] border-l border-[var(--viewer-border)] bg-[var(--background-default-grey)] max-[769px]:absolute max-[769px]:inset-y-0 max-[769px]:right-0 max-[769px]:z-20 max-[769px]:w-[min(100vw,26rem)] min-[769px]:max-[1025px]:absolute min-[769px]:max-[1025px]:inset-y-0 min-[769px]:max-[1025px]:right-0 min-[769px]:max-[1025px]:w-[22rem] min-[769px]:max-[897px]:w-[min(22rem,48vw)]`}
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
        <Button
          iconId="fr-icon-close-line"
          onClick={onClose}
          priority="tertiary no outline"
          size="small"
          title="Fermer le panneau"
        />
      </header>
      <div className={`${styles.body} min-h-0 overflow-auto`} data-mode={mode}>
        {children}
      </div>
    </aside>
  );
}
