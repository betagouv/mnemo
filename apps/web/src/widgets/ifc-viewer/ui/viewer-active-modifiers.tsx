"use client";

import type { ViewerActiveModifier } from "../model/viewer-active-modifiers";
import type { ViewerPanelId } from "../model/viewer-tool-catalog";

import styles from "./viewer-active-modifiers.module.css";

export function ViewerActiveModifiers({
  activePanel,
  modifiers,
  onOpen,
}: {
  activePanel: ViewerPanelId | null;
  modifiers: readonly ViewerActiveModifier[];
  onOpen: (modifier: ViewerActiveModifier, trigger: HTMLButtonElement) => void;
}) {
  if (modifiers.length === 0) return null;

  return (
    <div aria-label="Modificateurs actifs" className={styles.root}>
      {modifiers.map((modifier) => (
        <button
          aria-label={`${modifier.label} — ouvrir le panneau`}
          aria-pressed={activePanel === modifier.panel}
          className={styles.modifier}
          key={modifier.id}
          onClick={(event) => onOpen(modifier, event.currentTarget)}
          title="Ouvrir les réglages du modificateur"
          type="button"
        >
          <span aria-hidden="true" className={modifier.icon} />
          <span className={styles.label}>{modifier.label}</span>
          <span aria-hidden="true" className="fr-icon-arrow-right-line" />
        </button>
      ))}
    </div>
  );
}
