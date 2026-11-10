"use client";
import { useState } from "react";
import Button from "@codegouvfr/react-dsfr/Button";
import type {
  IfcViewerController,
  IfcViewerSnapshot,
} from "@mnemo/ifc-viewer-adapter";
import { IfcPropertiesPane } from "./ifc-properties-pane";
import styles from "./viewer-selection.module.css";
export function ViewerSelection({
  snapshot,
  getViewer,
  modelName,
  canCreateBcf,
  onCreateBcf,
  onReveal,
}: {
  snapshot: IfcViewerSnapshot;
  getViewer: () => IfcViewerController | null;
  modelName: string | null;
  canCreateBcf: boolean;
  onCreateBcf: (trigger: HTMLButtonElement) => void;
  onReveal: (trigger: HTMLButtonElement) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const selection = snapshot.selection;
  const viewer = getViewer();
  if (snapshot.selectionPhase === "error")
    return (
      <aside className={styles.root} aria-label="Erreur de sélection">
        <div className="flex items-center justify-between gap-2 p-3">
          <p className="mb-0 text-sm" role="alert">
            {snapshot.selectionMessage ??
              "Les propriétés n’ont pas pu être lues."}
          </p>
          <Button
            size="small"
            priority="tertiary no outline"
            iconId="fr-icon-close-line"
            title="Fermer l’erreur de sélection"
            onClick={() => viewer?.selectEntity(null)}
          />
        </div>
      </aside>
    );
  if (!selection && snapshot.selectionPhase === "loading")
    return (
      <aside className={styles.root} aria-label="Chargement de la sélection">
        <p className="m-0 p-3 text-sm" role="status">
          Lecture des propriétés…
        </p>
      </aside>
    );
  if (!selection || !snapshot.activeModelId) return null;
  const element = viewer?.getBimElement(
    snapshot.activeModelId,
    selection.expressId,
  );
  const storey = snapshot.catalog?.storeys.find(
    (storey) => storey.expressId === element?.storeyId,
  );
  return (
    <aside
      className={styles.root}
      data-expanded={detailsOpen || undefined}
      aria-label="Élément sélectionné"
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="mb-1 text-xs text-[var(--text-mention-grey)]">
              {selection.ifcClass}
              {storey ? ` · ${storey.name}` : ""}
              {snapshot.selectedElements.length > 1
                ? ` · ${snapshot.selectedElements.length} sélectionnés`
                : ""}
            </p>
            <h2 className="mb-2 break-words text-base">
              {selection.name || `Élément #${selection.expressId}`}
            </h2>
          </div>
          <Button
            size="small"
            priority="tertiary no outline"
            iconId="fr-icon-close-line"
            title="Effacer la sélection"
            onClick={() => viewer?.selectEntity(null)}
          />
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Actions de la sélection"
        >
          <Button
            size="small"
            priority="secondary"
            iconId="fr-icon-focus-3-line"
            onClick={() => viewer?.frameSelection()}
          >
            Cadrer
          </Button>
          <Button
            size="small"
            priority="secondary"
            onClick={() =>
              viewer?.applyVisualPlan({
                focusIds: snapshot.selectedElements
                  .filter(
                    (element) => element.assetId === snapshot.activeModelId,
                  )
                  .map((element) => element.expressId),
                label: "Sélection isolée",
              })
            }
          >
            {snapshot.selectedElements.some(
              (element) => element.assetId !== snapshot.activeModelId,
            )
              ? "Isoler dans cette maquette"
              : "Isoler"}
          </Button>
          <Button
            size="small"
            priority="secondary"
            onClick={() => {
              for (const element of snapshot.selectedElements)
                viewer?.setLayerVisibility(
                  element.assetId,
                  { kind: "element", expressId: element.expressId },
                  "hide",
                );
            }}
          >
            Masquer
          </Button>
          <Button
            size="small"
            priority="tertiary no outline"
            onClick={(event) => onReveal(event.currentTarget)}
          >
            Afficher dans l’arborescence
          </Button>
          {canCreateBcf && selection.globalId ? (
            <Button
              size="small"
              priority="tertiary no outline"
              iconId="fr-icon-chat-3-line"
              onClick={(event) => onCreateBcf(event.currentTarget)}
            >
              Créer une remarque
            </Button>
          ) : null}
          <Button
            size="small"
            priority="tertiary no outline"
            nativeButtonProps={{ "aria-expanded": detailsOpen }}
            onClick={() => setDetailsOpen(!detailsOpen)}
          >
            {detailsOpen ? "Réduire les propriétés" : "Voir les propriétés"}
          </Button>
        </div>
      </div>
      {detailsOpen ? (
        <div className="min-h-0 overflow-hidden">
          <IfcPropertiesPane
            activeModelId={snapshot.activeModelId}
            modelName={modelName}
            snapshot={snapshot}
            onClearSelection={() => viewer?.selectEntity(null)}
            onFrameSelection={() => viewer?.frameSelection()}
          />
        </div>
      ) : null}
    </aside>
  );
}
