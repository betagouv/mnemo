"use client";

import {
  type MeasurementEditorSlot,
  useProjectMeasurements,
} from "@/entities/measurement";
import {
  planPointToProject,
  planPointToScene,
  projectPointToPlan,
  type PlanMeasurementViewer,
} from "../model/plan-measurement-coordinates";
import {
  floorPlanCutHeightLabel,
  floorPlanElevationLabels,
} from "../model/floor-plan-altimetry";
import { formatMeasurement, distanceBetween } from "@mnemo/domain/measurement";
import type { FloorPlanRule } from "@mnemo/contracts/floor-plans";
import { FloorPlanPdfButton } from "./floor-plan-pdf-button";
import Button from "@codegouvfr/react-dsfr/Button";
import type {
  IfcSectionSnapshot,
  FloorPlanDrawing,
  FloorPlanPresetId,
} from "@mnemo/ifc-viewer-adapter";
import type { FloorPlanPdfInfo } from "../infrastructure/pdf/floor-plan-pdf-sheet";
import { useMemo, useState } from "react";
import { planSectionTrace } from "../model/plan-section-trace";
import { useFloorPlanCanvas } from "../model/use-floor-plan-canvas";

export type { FloorPlanDrawing } from "@mnemo/ifc-viewer-adapter";

export function FloorPlanView({
  title,
  section,
  savedPlanId,
  Editor,
  getViewer,
  exportTitle,
  exportContext,
  drawing,
  preset,
  rules,
  onSection,
  onClose,
  selectedIds,
  onSelect,
}: {
  title: string;
  Editor: MeasurementEditorSlot;
  section: IfcSectionSnapshot;
  savedPlanId: string | null;
  getViewer: () => PlanMeasurementViewer | null;
  exportTitle: string;
  exportContext: Pick<
    FloorPlanPdfInfo,
    | "projectName"
    | "sourceName"
    | "storeyName"
    | "storeyElevation"
    | "verticalDatum"
  >;
  drawing: FloorPlanDrawing;
  preset: FloorPlanPresetId;
  rules: readonly FloorPlanRule[];
  onSection: (
    start: ReturnType<typeof planPointToScene>,
    end: ReturnType<typeof planPointToScene>,
  ) => void;
  onClose: () => void;
  selectedIds: readonly number[];
  onSelect: (expressId: number | null) => void;
}) {
  const stored = useProjectMeasurements();
  const saved = useMemo(
    () =>
      stored.items.filter(
        (item) => item.floorPlanId === savedPlanId && savedPlanId !== null,
      ),
    [stored.items, savedPlanId],
  );
  const savedSegments = useMemo(() => {
    const viewer = getViewer();
    return viewer
      ? saved
          .filter((item) => item.kind === "distance")
          .map((item) => ({
            start: projectPointToPlan(viewer, drawing, item.points[0]!),
            end: projectPointToPlan(viewer, drawing, item.points[1]!),
          }))
      : [];
  }, [saved, drawing, getViewer]);
  const trace = useMemo(
    () => planSectionTrace(section, !!drawing.config.plane.flipped),
    [section, drawing],
  );
  const [tool, setTool] = useState<"select" | "measure" | "section">("select");
  const measuring = tool === "measure";
  const {
    containerRef,
    canvasRef,
    overlayRef,
    statusRef,
    hasFirstPoint,
    count,
    draftMeasurements,
    remove,
    fit,
    undo,
    clear,
  } = useFloorPlanCanvas(
    drawing,
    tool,
    preset,
    rules,
    selectedIds,
    onSelect,
    savedSegments,
    trace,
    (start, end) => {
      setTool("select");
      onSection(
        planPointToScene(drawing, start),
        planPointToScene(drawing, end),
      );
    },
  );
  return (
    <div
      className="absolute inset-0 z-30 flex min-h-0 flex-col bg-[var(--background-default-grey)]"
      aria-label={`Plan du niveau ${title}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-default-grey)] px-4 py-3">
        <div>
          <h2 className="mb-0 text-base">{exportTitle}</h2>
          <span className="text-xs text-[var(--text-mention-grey)]">
            {exportTitle !== title && `${title} · `}Coupe à{" "}
            {floorPlanCutHeightLabel} ·{" "}
            {floorPlanElevationLabels(
              exportContext.storeyElevation,
              exportContext.verticalDatum,
            ).join(" · ")}
          </span>
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Outils du plan"
        >
          <Button
            size="small"
            priority={measuring ? "primary" : "tertiary no outline"}
            iconId="fr-icon-ruler-line"
            nativeButtonProps={{ "aria-pressed": measuring }}
            onClick={() => setTool(measuring ? "select" : "measure")}
          >
            Mesurer
          </Button>
          <Button
            size="small"
            iconId="fr-icon-crop-line"
            priority={tool === "section" ? "primary" : "tertiary no outline"}
            nativeButtonProps={{ "aria-pressed": tool === "section" }}
            onClick={() => setTool(tool === "section" ? "select" : "section")}
          >
            {tool === "section" ? "Annuler le tracé" : "Tracer une coupe"}
          </Button>
          <Button
            size="small"
            priority="tertiary no outline"
            title="Tout cadrer (F ou double-clic)"
            iconId="fr-icon-focus-3-line"
            onClick={fit}
          />
          {draftMeasurements.length > 0 ? (
            <Button
              size="small"
              priority="tertiary no outline"
              onClick={undo}
              title="Annuler la dernière mesure (Suppr)"
              iconId="fr-icon-arrow-go-back-line"
            />
          ) : null}
          {draftMeasurements.length > 1 ? (
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
      {measuring || count ? (
        <details className="flex-none border-b border-[var(--border-default-grey)] px-4 py-2">
          <summary className="cursor-pointer text-sm">
            Mesures du plan ({count})
          </summary>
          {!savedPlanId ? (
            <p className="mt-2 text-sm">
              Enregistrez cette vue en plan pour pouvoir y conserver des
              mesures.
            </p>
          ) : null}
          {stored.error ? (
            <p className="fr-error-text" role="alert">
              {stored.error}
            </p>
          ) : null}
          <ul className="m-0 max-h-64 list-none overflow-y-auto p-0">
            {saved.map((item) => (
              <li
                key={item.id}
                className="border-t border-[var(--border-default-grey)] py-2"
              >
                <strong className="mb-1 block">
                  {formatMeasurement(
                    distanceBetween(item.points[0]!, item.points[1]!),
                    "distance",
                  )}
                </strong>
                <Editor measurement={item} />
              </li>
            ))}
            {draftMeasurements.map((item, index) => (
              <li
                key={item.id}
                className="border-t border-[var(--border-default-grey)] py-2"
              >
                <strong className="mb-1 block">
                  {formatMeasurement(
                    Math.hypot(
                      item.end.x - item.start.x,
                      item.end.y - item.start.y,
                    ),
                    "distance",
                  )}
                </strong>
                {savedPlanId ? (
                  <Editor
                    measurement={{
                      id: item.id,
                      name: `Distance ${saved.length + index + 1}`,
                      kind: "distance",
                      floorPlanId: savedPlanId,
                      points: [item.start, item.end].map((point) =>
                        planPointToProject(getViewer()!, drawing, point),
                      ),
                    }}
                    onSaved={() => remove(item.id)}
                    onDiscard={() => remove(item.id)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div
        ref={containerRef}
        tabIndex={0}
        role="group"
        aria-label={`Plan interactif du niveau ${title}`}
        aria-describedby="floor-plan-help"
        className="relative min-h-0 flex-1 overflow-hidden bg-white outline-offset-[-2px]"
        style={{ touchAction: "none" }}
      >
        {tool === "section" && (
          <div className="absolute inset-x-0 top-3 z-10 flex justify-center pointer-events-none">
            <span
              role="status"
              className="bg-[var(--background-default-grey)] px-3 py-2 text-sm shadow"
            >
              {hasFirstPoint
                ? "Placez le second point pour voir la coupe en 3D."
                : "Placez le premier point de la coupe."}
            </span>
          </div>
        )}
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
          {tool === "section"
            ? "Maj pour aligner · Alt pour un point libre · Échap pour recommencer"
            : measuring
              ? "Deux points pour mesurer · Maj pour aligner · Alt pour un point libre · Échap pour annuler · Espace + glisser pour déplacer"
              : "Cliquer pour sélectionner · Glisser pour déplacer · Molette pour zoomer · Double-clic pour cadrer"}
        </span>
        <span ref={statusRef} />
        <span role="status">
          {(measuring || count > 0) && `${count} mesure${count > 1 ? "s" : ""}`}
        </span>
      </div>
    </div>
  );
}
