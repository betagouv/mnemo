"use client";

import type { FloorPlanRule } from "@mnemo/contracts/floor-plans";
import { FloorPlanPdfButton } from "./floor-plan-pdf-button";
import Button from "@codegouvfr/react-dsfr/Button";
import type {
  FloorPlanDrawing,
  FloorPlanPresetId,
} from "@mnemo/ifc-viewer-adapter";
import type { FloorPlanPdfInfo } from "../infrastructure/pdf/floor-plan-pdf-sheet";
import { useState } from "react";
import { useFloorPlanCanvas } from "../model/use-floor-plan-canvas";

export type { FloorPlanDrawing } from "@mnemo/ifc-viewer-adapter";

export function FloorPlanView({
  title,
  exportTitle,
  exportContext,
  drawing,
  preset,
  rules,
  onClose,
  selectedIds,
  onSelect,
}: {
  title: string;
  exportTitle: string;
  exportContext: Pick<
    FloorPlanPdfInfo,
    "projectName" | "sourceName" | "storeyName" | "storeyElevation"
  >;
  drawing: FloorPlanDrawing;
  preset: FloorPlanPresetId;
  rules: readonly FloorPlanRule[];
  onClose: () => void;
  selectedIds: readonly number[];
  onSelect: (expressId: number | null) => void;
}) {
  const [measuring, setMeasuring] = useState(false);
  const {
    containerRef,
    canvasRef,
    overlayRef,
    statusRef,
    count,
    fit,
    undo,
    clear,
  } = useFloorPlanCanvas(
    drawing,
    measuring,
    preset,
    rules,
    selectedIds,
    onSelect,
  );
  return (
    <div
      className="absolute inset-0 z-30 flex min-h-0 flex-col bg-[var(--background-default-grey)]"
      aria-label={`Plan du niveau ${title}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-default-grey)] px-4 py-3">
        <div>
          <h2 className="mb-0 text-base">{title}</h2>
          <span className="text-xs text-[var(--text-mention-grey)]">
            Plan de coupe à +1,20 m
          </span>
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Outils du plan"
        >
          <Button
            size="small"
            priority={measuring ? "primary" : "secondary"}
            iconId="fr-icon-ruler-line"
            nativeButtonProps={{ "aria-pressed": measuring }}
            onClick={() => setMeasuring(!measuring)}
          >
            Mesurer
          </Button>
          <Button
            size="small"
            priority="tertiary no outline"
            title="Tout cadrer (F ou double-clic)"
            iconId="fr-icon-focus-3-line"
            onClick={fit}
          />
          {count > 0 ? (
            <Button
              size="small"
              priority="tertiary no outline"
              onClick={undo}
              title="Annuler la dernière mesure (Suppr)"
              iconId="fr-icon-arrow-go-back-line"
            />
          ) : null}
          {count > 1 ? (
            <Button
              size="small"
              priority="tertiary no outline"
              onClick={clear}
              title="Effacer les mesures"
              iconId="fr-icon-delete-line"
            />
          ) : null}
          <FloorPlanPdfButton
            drawing={drawing}
            preset={preset}
            rules={rules}
            title={exportTitle}
            context={exportContext}
          />
          <Button size="small" priority="secondary" onClick={onClose}>
            Retour à la 3D
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        tabIndex={0}
        role="group"
        aria-label={`Plan interactif du niveau ${title}`}
        aria-describedby="floor-plan-help"
        className="relative min-h-0 flex-1 overflow-hidden bg-white outline-offset-[-2px]"
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          aria-label={`Dessin du niveau ${title}`}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <canvas
          ref={overlayRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-default-grey)] px-4 py-2 text-xs text-[var(--text-mention-grey)]">
        <span id="floor-plan-help">
          {measuring
            ? "Deux points pour mesurer · Maj pour aligner · Alt pour un point libre · Échap pour annuler · Espace + glisser pour déplacer"
            : "Cliquer pour sélectionner · Glisser pour déplacer · Molette pour zoomer · Double-clic pour cadrer"}
        </span>
        <span ref={statusRef} />
        <span role="status">
          {count} mesure{count > 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
