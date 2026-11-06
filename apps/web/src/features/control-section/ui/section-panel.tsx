"use client";

import type { SectionViewer } from "../model/viewer-target";
import Button from "@codegouvfr/react-dsfr/Button";
import Input from "@codegouvfr/react-dsfr/Input";
import { SegmentedControl } from "@codegouvfr/react-dsfr/SegmentedControl";
import type { IfcSectionSnapshot } from "@mnemo/ifc-viewer-adapter";
import { useEffect, useRef, useState } from "react";

import styles from "./section-panel.module.css";

type SectionMode = "plane" | "box";
type Box = NonNullable<IfcSectionSnapshot["box"]>;
type BoxAxis = 0 | 1 | 2;

const boxFields = [
  { label: "Gauche", axis: 0, side: "min" },
  { label: "Droite", axis: 0, side: "max" },
  { label: "Bas", axis: 1, side: "min" },
  { label: "Haut", axis: 1, side: "max" },
  { label: "Arrière", axis: 2, side: "min" },
  { label: "Avant", axis: 2, side: "max" },
] as const;

function BoxFaceInput({
  axis,
  box,
  getViewer,
  label,
  side,
}: {
  axis: BoxAxis;
  box: Box;
  getViewer: () => SectionViewer | null;
  label: string;
  side: "min" | "max";
}) {
  const value = box[side][axis];
  const [draft, setDraft] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const commit = () => {
    if (draft === null) return;
    const text = draft;
    const parsed = Number(text.replace(",", "."));
    if (text.trim() && Number.isFinite(parsed))
      getViewer()?.moveSectionBoxFace(axis, side, parsed);
    setDraft(null);
  };

  return (
    <Input
      label={`${label} (m)`}
      nativeInputProps={{
        inputMode: "decimal",
        type: "text",
        value: draft ?? String(Number(value.toFixed(3))),
        onChange: (event) => setDraft(event.target.value),
        onBlur: () => {
          if (cancelRef.current) {
            cancelRef.current = false;
            setDraft(null);
          } else {
            commit();
          }
        },
        onKeyDown: (event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
            return;
          }
          if (event.key === "Escape") {
            cancelRef.current = true;
            event.currentTarget.blur();
            return;
          }
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const step = event.shiftKey ? 1 : 0.1;
          const current =
            getViewer()?.getSnapshot().section.box?.[side][axis] ?? value;
          const next = Number(
            (current + (event.key === "ArrowUp" ? step : -step)).toFixed(3),
          );
          getViewer()?.moveSectionBoxFace(axis, side, next);
          setDraft(null);
        },
      }}
    />
  );
}

export function SectionPanel({
  getViewer,
  hasIfcGeometry,
  hasPointCloud,
  mode,
  onModeChange,
  section,
}: {
  getViewer: () => SectionViewer | null;
  hasIfcGeometry: boolean;
  hasPointCloud: boolean;
  mode: SectionMode;
  onModeChange: (mode: SectionMode) => void;
  section: IfcSectionSnapshot;
}) {
  const controller = getViewer();
  const canCut = hasIfcGeometry || hasPointCloud;
  const cutVisible = section.active !== null;

  useEffect(() => () => getViewer()?.cancelSectionPick(), [getViewer]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <SegmentedControl
        className={styles.modeControl}
        hideLegend
        legend="Type de coupe"
        segments={[
          {
            label: "Plan de coupe",
            nativeInputProps: {
              checked: mode === "plane",
              onChange: () => onModeChange("plane"),
              value: "plane",
            },
          },
          {
            label: "Boîte de coupe",
            nativeInputProps: {
              checked: mode === "box",
              onChange: () => onModeChange("box"),
              value: "box",
            },
          },
        ]}
      />

      <div
        className="flex items-center justify-between gap-3 text-sm"
        role="status"
      >
        <span className={styles.muted}>
          {cutVisible
            ? section.active === "box"
              ? "Boîte de coupe visible"
              : "Plan de coupe visible"
            : "Aucune coupe visible"}
        </span>
        {cutVisible ? (
          <Button
            onClick={() => controller?.hideSection()}
            priority="tertiary no outline"
            size="small"
          >
            Masquer
          </Button>
        ) : null}
      </div>

      {!canCut ? (
        <p className="fr-hint-text m-0" role="status">
          Ajoutez une maquette IFC ou un relevé 3D pour créer une coupe.
        </p>
      ) : null}

      {mode === "plane" ? (
        <div className="flex flex-col gap-4">
          <section
            className={`${styles.card} p-4`}
            aria-labelledby="section-axis-title"
          >
            <h3 className="mb-2 text-base" id="section-axis-title">
              Plan de coupe
            </h3>
            <p className={`${styles.muted} mb-4 text-sm`}>
              Choisissez une orientation. Dans la scène, faites glisser la
              flèche colorée pour déplacer le plan.
            </p>
            <SegmentedControl
              className={styles.axisControl}
              hideLegend
              legend="Orientation du plan"
              segments={[
                {
                  label: "Horizontal",
                  nativeInputProps: {
                    checked:
                      section.active === "plane" &&
                      section.plane.source === "axis" &&
                      section.plane.axis === "down",
                    disabled: !canCut,
                    onChange: () => controller?.setSectionAxis("down"),
                    value: "down",
                  },
                },
                {
                  label: "Frontal",
                  nativeInputProps: {
                    checked:
                      section.active === "plane" &&
                      section.plane.source === "axis" &&
                      section.plane.axis === "front",
                    disabled: !canCut,
                    onChange: () => controller?.setSectionAxis("front"),
                    value: "front",
                  },
                },
                {
                  label: "Latéral",
                  nativeInputProps: {
                    checked:
                      section.active === "plane" &&
                      section.plane.source === "axis" &&
                      section.plane.axis === "side",
                    disabled: !canCut,
                    onChange: () => controller?.setSectionAxis("side"),
                    value: "side",
                  },
                },
              ]}
              small
            />
            {section.plane.source !== "axis" ? (
              <p className={`${styles.muted} mb-0 mt-3 text-sm`}>
                {section.plane.source === "face"
                  ? "Plan ancré sur la face choisie."
                  : "Plan créé à partir des deux points."}{" "}
                Déplacez-le directement dans la maquette.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={!canCut}
                onClick={() =>
                  controller?.setSectionFlipped(!section.plane.flipped)
                }
                priority="secondary"
                size="small"
              >
                {section.plane.flipped ? "Côté inversé" : "Inverser le côté"}
              </Button>
              {section.active !== "plane" ? (
                <Button
                  disabled={!canCut}
                  onClick={() => controller?.showSectionPlane()}
                  size="small"
                >
                  Afficher la coupe
                </Button>
              ) : null}
            </div>
          </section>

          {hasIfcGeometry ? (
            <section
              className={`${styles.card} p-4`}
              aria-labelledby="section-pick-title"
            >
              <h3 className="mb-2 text-base" id="section-pick-title">
                Couper dans la maquette
              </h3>
              <p className={`${styles.muted} mb-4 text-sm`}>
                Ancrez le plan sur une face ou dessinez une ligne de coupe dans
                la scène.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => controller?.startSectionPick("face")}
                  priority="secondary"
                  size="small"
                >
                  Choisir une face
                </Button>
                <Button
                  onClick={() => controller?.startSectionPick("two-point")}
                  priority="secondary"
                  size="small"
                >
                  Tracer deux points
                </Button>
              </div>
              {section.pickMode ? (
                <div
                  className="mt-4 rounded bg-[var(--background-alt-blue-france)] p-3 text-sm"
                  role="status"
                >
                  <p className="mb-2">
                    {section.pickMode === "face"
                      ? "Cliquez sur une face de la maquette."
                      : section.draftPoint === null
                        ? "Cliquez sur le premier point : il restera visible dans la scène."
                        : "Déplacez la souris pour orienter la ligne, puis cliquez sur le deuxième point."}
                  </p>
                  <Button
                    onClick={() => controller?.cancelSectionPick()}
                    priority="tertiary no outline"
                    size="small"
                  >
                    Annuler le tracé
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : (
        <section
          className={`${styles.card} p-4`}
          aria-labelledby="section-box-title"
        >
          <h3 className="mb-2 text-base" id="section-box-title">
            Boîte de coupe
          </h3>
          <p className={`${styles.muted} mb-4 text-sm`}>
            Faites glisser les flèches colorées perpendiculaires aux faces pour
            cadrer la zone conservée. Vous pouvez aussi saisir une position
            ci-dessous.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!hasIfcGeometry}
              onClick={() => controller?.showSectionBox()}
              size="small"
            >
              {section.box ? "Afficher la boîte" : "Créer une boîte"}
            </Button>
            {section.box ? (
              <Button
                disabled={!hasIfcGeometry}
                onClick={() => controller?.fitSectionBox()}
                priority="secondary"
                size="small"
              >
                Recentrer
              </Button>
            ) : null}
          </div>
          {section.active === "box" && section.box ? (
            <div className="mt-5">
              <h4 className="mb-2 text-sm">Position des faces</h4>
              <p className="fr-hint-text mb-3">
                Valeurs en mètres. Utilisez les flèches du clavier pour ajuster
                de 10 cm, ou Maj + flèche pour 1 m.
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {boxFields.map((field) => (
                  <BoxFaceInput
                    axis={field.axis}
                    box={section.box!}
                    getViewer={getViewer}
                    key={`${field.axis}-${field.side}`}
                    label={field.label}
                    side={field.side}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {hasPointCloud ? (
            <p className={`${styles.muted} mb-0 mt-4 text-xs`}>
              La boîte découpe la maquette IFC ; le relevé 3D reste visible.
            </p>
          ) : null}
        </section>
      )}

      {section.message ? (
        <p className="fr-error-text m-0" role="alert">
          {section.message}
        </p>
      ) : null}
      {cutVisible ? (
        <Button
          onClick={() => controller?.resetSection()}
          priority="tertiary no outline"
          size="small"
        >
          Réinitialiser la coupe
        </Button>
      ) : null}
    </div>
  );
}
