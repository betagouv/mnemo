import Button from "@codegouvfr/react-dsfr/Button";
import type { IfcViewerSnapshot } from "@mnemo/ifc-viewer-adapter";
import { useId } from "react";

import { IfcElementProperties } from "@/entities/ifc-element";

import styles from "./ifc-properties-pane.module.css";

export function IfcPropertiesPane({
  activeModelId,
  modelName,
  onClearSelection,
  onFrameSelection,
  snapshot,
}: {
  activeModelId: string | null;
  modelName: string | null;
  onClearSelection: () => void;
  onFrameSelection: () => void;
  snapshot: IfcViewerSnapshot;
}) {
  const titleId = useId();
  const selection = snapshot.selection;

  return (
    <section aria-labelledby={titleId} className={styles.root}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <span aria-hidden="true" className="fr-icon-file-text-line" />
          <h2 id={titleId}>Propriétés IFC</h2>
        </div>
        {selection ? (
          <div className={styles.actions}>
            <Button
              iconId="fr-icon-focus-3-line"
              onClick={onFrameSelection}
              priority="tertiary no outline"
              size="small"
              title="Cadrer l’élément sélectionné"
            />
            <Button
              iconId="fr-icon-close-line"
              onClick={onClearSelection}
              priority="tertiary no outline"
              size="small"
              title="Effacer la sélection"
            />
          </div>
        ) : null}
      </header>
      <div className={styles.body}>
        {snapshot.selectionPhase === "loading" ? (
          <p className={styles.message} role="status">
            Lecture des propriétés…
          </p>
        ) : snapshot.selectionPhase === "error" ? (
          <p className={styles.error} role="alert">
            {snapshot.selectionMessage ??
              "Les propriétés n’ont pas pu être lues."}
          </p>
        ) : selection ? (
          <IfcElementProperties
            element={selection}
            key={`${activeModelId}:${selection.expressId}`}
            modelName={modelName}
          />
        ) : (
          <div className={styles.empty}>
            <span aria-hidden="true" className="fr-icon-cursor-line" />
            <strong>Sélectionnez un élément</strong>
            <p>Ses propriétés IFC apparaîtront ici.</p>
          </div>
        )}
      </div>
    </section>
  );
}
