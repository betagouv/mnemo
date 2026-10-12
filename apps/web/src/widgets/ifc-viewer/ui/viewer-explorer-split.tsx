"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";

import styles from "./viewer-explorer-split.module.css";

const minimumPercent = 20;
const maximumPercent = 80;

function clampPercent(value: number) {
  return Math.min(maximumPercent, Math.max(minimumPercent, value));
}

export function ViewerExplorerSplit({
  explorer,
  inspector,
}: {
  explorer: ReactNode;
  inspector: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [explorerPercent, setExplorerPercent] = useState(50);

  const resizeToPointer = (clientY: number) => {
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds?.height) return;
    setExplorerPercent(
      clampPercent(((clientY - bounds.top) / bounds.height) * 100),
    );
  };

  return (
    <div
      className={styles.root}
      ref={rootRef}
      style={{ "--explorer-percent": `${explorerPercent}%` } as CSSProperties}
    >
      <div className={styles.explorer}>{explorer}</div>
      <div
        aria-label="Répartir la hauteur entre l’explorateur et les propriétés IFC"
        aria-orientation="horizontal"
        aria-valuemax={maximumPercent}
        aria-valuemin={minimumPercent}
        aria-valuenow={Math.round(explorerPercent)}
        className={styles.divider}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setExplorerPercent((value) => clampPercent(value - 5));
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setExplorerPercent((value) => clampPercent(value + 5));
          } else if (event.key === "Home") {
            event.preventDefault();
            setExplorerPercent(minimumPercent);
          } else if (event.key === "End") {
            event.preventDefault();
            setExplorerPercent(maximumPercent);
          }
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeToPointer(event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            resizeToPointer(event.clientY);
          }
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        role="separator"
        tabIndex={0}
      >
        <span aria-hidden="true" />
      </div>
      <div className={styles.inspector}>{inspector}</div>
    </div>
  );
}
