"use client";

import { useId, useState, type ReactNode } from "react";

import styles from "./inline-disclosure.module.css";

export function InlineDisclosure({
  children,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandedChange,
  label,
  visibilityControl,
}: {
  children: ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  label: string;
  visibilityControl?: ReactNode;
}) {
  const [localExpanded, setExpanded] = useState(defaultExpanded);
  const expanded = controlledExpanded ?? localExpanded;
  const contentId = useId();

  return (
    <section className={styles.disclosure}>
      <div className={styles.header} data-expanded={expanded}>
        {visibilityControl}
        <h3 className={styles.heading}>
          <button
            aria-controls={contentId}
            aria-expanded={expanded}
            className={styles.toggle}
            onClick={() => {
              if (controlledExpanded === undefined) setExpanded(!expanded);
              onExpandedChange?.(!expanded);
            }}
            title={label}
            type="button"
          >
            <span className={styles.label}>{label}</span>
            <span
              aria-hidden="true"
              className={`fr-icon-arrow-down-s-line ${styles.chevron}`}
            />
          </button>
        </h3>
      </div>
      <div className={styles.body} hidden={!expanded} id={contentId}>
        {children}
      </div>
    </section>
  );
}
