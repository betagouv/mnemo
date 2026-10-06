"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import { useEffect, useId, useRef, type ReactNode } from "react";

import styles from "./viewer-side-panel.module.css";

export function ViewerSidePanel({
  actions,
  children,
  focusRequest,
  iconClass,
  isOpen,
  mode,
  onClose,
  title,
}: {
  actions?: ReactNode;
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
    <aside aria-labelledby={titleId} className={styles.root} hidden={!isOpen}>
      <header className={styles.header}>
        <div className={styles.heading}>
          {iconClass ? <span aria-hidden="true" className={iconClass} /> : null}
          <h2 id={titleId} ref={titleRef} tabIndex={-1}>
            {title}
          </h2>
        </div>
        <div className={styles.actions}>
          {actions}
          <Button
            iconId="fr-icon-close-line"
            onClick={onClose}
            priority="tertiary no outline"
            size="small"
            title="Fermer le panneau"
          />
        </div>
      </header>
      <div className={styles.body} data-mode={mode}>
        {children}
      </div>
    </aside>
  );
}
