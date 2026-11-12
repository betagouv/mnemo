"use client";

import { useProjectMeasurements } from "@/entities/measurement";
import { SegmentedControl } from "@codegouvfr/react-dsfr/SegmentedControl";
import Button from "@codegouvfr/react-dsfr/Button";
import { ToggleSwitch } from "@codegouvfr/react-dsfr/ToggleSwitch";
import { formatMeasurement, distanceBetween } from "@mnemo/domain/measurement";
import { useMeasurementContext } from "../model/measurement-context";

export function MeasurementPanel() {
  const { controller, mode, enabled, getViewer, Editor, onModeChange } =
    useMeasurementContext();
  const { draft, cursor, measurements } = controller;
  const stored = useProjectMeasurements();
  if (!enabled)
    return (
      <p className="p-4">Chargez une maquette pour mesurer dans la scène.</p>
    );
  const previewDistance =
    mode === "distance" && draft[0] && cursor
      ? distanceBetween(draft[0], cursor.point)
      : null;
  return (
    <div className="flex flex-col gap-5 p-4">
      <SegmentedControl
        small
        hideLegend
        legend="Type de mesure"
        segments={[
          {
            label: "Distance",
            nativeInputProps: {
              value: "distance",
              checked: mode === "distance",
              onChange: () => onModeChange("distance"),
            },
          },
          {
            label: "Surface",
            nativeInputProps: {
              value: "surface",
              checked: mode === "surface",
              onChange: () => onModeChange("surface"),
            },
          },
        ]}
      />

      <ToggleSwitch
        label="Accrochage et alignements"
        checked={controller.magnetic}
        onChange={controller.setMagnetic}
        showCheckedHint={false}
      />
      <p className="fr-text--xs m-0 text-[var(--text-mention-grey)]">
        Points de mesure prioritaires, sommets, arêtes et alignements. Un
        contour de surface reste sur le plan défini par ses trois premiers
        points.
      </p>
      <div>
        <p className="m-0" role="status" aria-live="polite">
          {mode === "distance"
            ? draft.length
              ? "Choisissez le second point."
              : "Choisissez le premier point."
            : draft.length
              ? `${draft.length} points placés. Refermez le contour ou terminez la surface.`
              : "Placez les points du contour sur un même plan."}
        </p>
        {previewDistance !== null ? (
          <strong className="mt-2 block text-lg">
            {formatMeasurement(previewDistance, "distance")}
          </strong>
        ) : null}
      </div>
      {stored.error ? (
        <p className="fr-error-text m-0" role="alert">
          {stored.error}
        </p>
      ) : null}
      {controller.error ? (
        <p className="fr-error-text m-0" role="alert">
          {controller.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {mode === "surface" ? (
          <Button
            size="small"
            disabled={draft.length < 3}
            onClick={controller.finish}
          >
            Terminer la surface
          </Button>
        ) : null}
        <Button
          size="small"
          priority="secondary"
          disabled={!draft.length}
          onClick={controller.undo}
        >
          Retirer le dernier point
        </Button>
        {draft.length ? (
          <Button
            size="small"
            priority="tertiary no outline"
            onClick={controller.cancel}
          >
            Annuler le tracé
          </Button>
        ) : null}
      </div>
      <p className="fr-text--xs m-0 text-[var(--text-mention-grey)]">
        Glisser pour orbiter · Maj + glisser pour déplacer · Molette pour zoomer
        · Échap pour annuler
        {mode === "surface" ? " · Entrée pour terminer" : ""}
      </p>
      <section
        aria-labelledby="scene-measurements-heading"
        className="border-t border-[var(--border-default-grey)] pt-4"
      >
        <h3 id="scene-measurements-heading" className="fr-h6 mb-3">
          Mesures ({measurements.length})
        </h3>
        {measurements.length ? (
          <>
            <ul className="m-0 list-none p-0">
              {measurements.map((item, index) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 border-b border-[var(--border-default-grey)] py-3"
                >
                  <div className="min-w-0 flex-1">
                    <strong className="mb-2 block">
                      {formatMeasurement(item.value, item.kind)}
                    </strong>
                    <Editor
                      measurement={{
                        id: item.id,
                        version: stored.items.find(
                          (saved) => saved.id === item.id,
                        )?.version,
                        name:
                          stored.items.find((saved) => saved.id === item.id)
                            ?.name ??
                          `${item.kind === "distance" ? "Distance" : "Surface"} ${index + 1}`,
                        kind: item.kind,
                        floorPlanId: null,
                        points: item.points.map((point) =>
                          getViewer()!.measurementToProject(point),
                        ),
                      }}
                      onSaved={() => controller.remove(item.id)}
                      onDiscard={() => controller.remove(item.id)}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {controller.localMeasurements.length ? (
              <Button
                className="mt-3"
                size="small"
                priority="secondary"
                onClick={controller.clear}
              >
                Effacer les mesures non enregistrées
              </Button>
            ) : null}
          </>
        ) : (
          <p className="fr-text--sm m-0">Les mesures apparaîtront ici.</p>
        )}
      </section>
    </div>
  );
}
