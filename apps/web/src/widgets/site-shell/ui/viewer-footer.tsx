"use client";

import { useEffect, useRef, useState } from "react";

import { SiteFooter } from "./site-shell";
import styles from "./viewer-footer.module.css";

export function ViewerFooter() {
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setExpanded(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);

  return (
    <div className={`${styles.root} relative z-20 h-14 flex-none`}>
      <div
        className={`${styles.panel} absolute right-0 bottom-0 left-0 shadow-[0_-8px_24px_rgb(0_0_0_/_12%)]`}
      >
        <button
          aria-label={expanded ? "Fermer" : "Plus d’informations"}
          aria-controls="fr-footer"
          aria-expanded={expanded}
          className={`${styles.toggle} fr-btn fr-btn--sm fr-btn--tertiary-no-outline`}
          onClick={() => setExpanded((current) => !current)}
          ref={toggleRef}
          type="button"
        >
          <span className={styles.toggleLabel}>
            {expanded ? "Fermer" : "Plus d’informations"}
          </span>
          <span
            aria-hidden="true"
            className={expanded ? "fr-icon-close-line" : styles.arrow}
          />
        </button>
        <SiteFooter className={expanded ? styles.expanded : styles.compacted} />
      </div>
    </div>
  );
}
