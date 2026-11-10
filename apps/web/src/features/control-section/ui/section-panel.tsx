"use client";

import type { SectionViewer } from "../model/viewer-target";
import Button from "@codegouvfr/react-dsfr/Button";
import Accordion from "@codegouvfr/react-dsfr/Accordion";
import ToggleSwitch from "@codegouvfr/react-dsfr/ToggleSwitch";
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
  const cutVisible = section.active === mode;

  useEffect(() => () => getViewer()?.cancelSectionPick(), [getViewer]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <SegmentedControl
        className={styles.modeControl}
        hideLegend
        legend="Type de coupe"
        segments={[
          {
            label: "Plan",
            nativeInputProps: {
              checked: mode === "plane",
              onChange: () => onModeChange("plane"),
              value: "plane",
            },
          },
          {
            label: "Boîte",
            nativeInputProps: {
              checked: mode === "box",
              onChange: () => onModeChange("box"),
              value: "box",
            },
          },
        ]}
      />
      <ToggleSwitch
        label="Coupe active"
        checked={cutVisible}
        disabled={!canCut || (mode === "box" && !hasIfcGeometry)}
        showCheckedHint={false}
        onChange={(enabled) => {
          if (!enabled) controller?.hideSection();
          else if (mode === "plane") controller?.showSectionPlane();
          else controller?.showSectionBox();
        }}
      />
      {!canCut ? (
        <p className="fr-hint-text m-0" role="status">
          Ajoutez une maquette IFC ou un relevé 3D pour créer une coupe.
        </p>
      ) : null}
      {mode === "plane" ? (
        <>
          <SegmentedControl
            className={styles.axisControl}
            legend="Orientation"
            small
            segments={[
              {
                label: "Horizontal",
                nativeInputProps: {
                  checked:
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
                    section.plane.source === "axis" &&
                    section.plane.axis === "side",
                  disabled: !canCut,
                  onChange: () => controller?.setSectionAxis("side"),
                  value: "side",
                },
              },
            ]}
          />
          <p className="fr-hint-text m-0">
            Déplacez la coupe avec la flèche dans la scène.
          </p>
          <Button
            disabled={!cutVisible}
            onClick={() =>
              controller?.setSectionFlipped(!section.plane.flipped)
            }
            priority="secondary"
            size="small"
            nativeButtonProps={{ "aria-pressed": section.plane.flipped }}
          >
            Inverser le côté conservé
          </Button>
          {hasIfcGeometry ? (
            <Accordion label="Créer depuis la maquette">
              <div className="flex flex-col gap-2">
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
            </Accordion>
          ) : null}
        </>
      ) : (
        <>
          <p className="fr-hint-text m-0">
            Ajustez les faces avec les flèches dans la scène.
          </p>
          {section.box ? (
            <Button
              disabled={!hasIfcGeometry}
              onClick={() => controller?.fitSectionBox()}
              priority="secondary"
              size="small"
            >
              Ajuster à la maquette
            </Button>
          ) : null}
          {cutVisible && section.box ? (
            <Accordion label="Position précise des faces">
              <p className="fr-hint-text">
                Valeurs en mètres. Flèches du clavier pour 10 cm, Maj + flèche
                pour 1 m.
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
            </Accordion>
          ) : null}
          {hasPointCloud ? (
            <p className="fr-hint-text m-0">
              La boîte découpe la maquette IFC. Le relevé 3D reste visible.
            </p>
          ) : null}
        </>
      )}
      {section.message ? (
        <p className="fr-error-text m-0" role="alert">
          {section.message}
        </p>
      ) : null}
      {section.active ? (
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
