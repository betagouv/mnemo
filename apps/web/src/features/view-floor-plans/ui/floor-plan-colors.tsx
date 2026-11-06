"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import Input from "@codegouvfr/react-dsfr/Input";
import { useId, useRef, useState } from "react";
import styles from "./floor-plan-colors.module.css";

type ColorField = "fillColor" | "strokeColor";
type Colors = Record<ColorField, string>;

const palette = [
  { color: "#ffffff", name: "Blanc" },
  { color: "#e8e6e1", name: "Pierre" },
  { color: "#b4b4b0", name: "Gris clair" },
  { color: "#808080", name: "Gris" },
  { color: "#414651", name: "Graphite" },
  { color: "#000000", name: "Noir" },
  { color: "#64748b", name: "Ardoise" },
  { color: "#7b9eac", name: "Bleu grisé" },
  { color: "#7d9b87", name: "Sauge" },
  { color: "#b5c5b6", name: "Vert clair" },
  { color: "#c9ad75", name: "Sable" },
  { color: "#b87560", name: "Terre cuite" },
  { color: "#9a7893", name: "Mauve" },
  { color: "#d4bfcd", name: "Rose grisé" },
];
const controls = [
  { field: "fillColor", label: "Remplissage" },
  { field: "strokeColor", label: "Contour" },
] as const;
const isColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export function FloorPlanColors({
  values,
  onChange,
  customColors,
  onAddColor,
}: {
  values: Colors;
  onChange: (patch: Partial<Colors>) => void;
  customColors: string[];
  onAddColor: (value: string) => void;
}) {
  const id = useId();
  const fillTrigger = useRef<HTMLButtonElement>(null);
  const strokeTrigger = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState<ColorField | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(values.fillColor);

  const current = controls.find((control) => control.field === active);
  const colors = [
    ...new Set(
      [
        ...palette.map(({ color }) => color),
        ...customColors,
        values.fillColor,
        values.strokeColor,
      ].map((color) => color.toLowerCase()),
    ),
  ];

  function close() {
    (active === "fillColor" ? fillTrigger : strokeTrigger).current?.focus();
    setActive(null);
    setAdding(false);
  }
  function select(color: string) {
    if (active) onChange({ [active]: color });
    close();
  }
  return (
    <div
      className={styles.field}
      role="group"
      aria-label="Couleurs du plan"
      onKeyDown={(event) => {
        if (event.key === "Escape" && active) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className={styles.controls}>
        {controls.map(({ field, label }) => (
          <Button
            key={field}
            ref={field === "fillColor" ? fillTrigger : strokeTrigger}
            className={styles.trigger}
            size="small"
            priority="tertiary no outline"
            title={`${label}, ${values[field]}`}
            nativeButtonProps={{
              "aria-expanded": active === field,
              "aria-controls": id,
              "aria-label": `${label}, ${values[field]}`,
            }}
            onClick={() => {
              setActive(active === field ? null : field);
              setAdding(false);
            }}
          >
            <span
              className={styles.sample}
              style={{ backgroundColor: values[field] }}
              aria-hidden="true"
            />
            {label}
            <span
              className="fr-icon-arrow-down-s-line fr-icon--sm"
              aria-hidden="true"
            />
          </Button>
        ))}
      </div>
      {current ? (
        <div id={id} className={styles.panel}>
          <div
            className={styles.palette}
            role="group"
            aria-label={`Couleurs pour ${current.label.toLowerCase()}`}
          >
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                className={styles.swatch}
                style={{ backgroundColor: color }}
                title={`${palette.find((item) => item.color === color)?.name ?? "Personnalisée"} (${color})`}
                aria-label={`Choisir ${color}`}
                aria-pressed={color === values[current.field].toLowerCase()}
                onClick={() => select(color)}
              />
            ))}
            <Button
              className={styles.add}
              size="small"
              priority="tertiary no outline"
              title="Autre couleur"
              iconId="fr-icon-add-line"
              onClick={() => {
                setDraft(values[current.field]);
                setAdding(!adding);
              }}
            />
          </div>
          {adding ? (
            <div className={styles.custom}>
              <input
                className={styles.customSample}
                type="color"
                aria-label={`Nouvelle couleur pour ${current.label.toLowerCase()}`}
                value={isColor(draft) ? draft : values[current.field]}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Input
                className={styles.hex}
                label="Code hexadécimal"
                nativeLabelProps={{ className: "fr-sr-only" }}
                nativeInputProps={{
                  value: draft,
                  maxLength: 7,
                  spellCheck: false,
                  placeholder: "#RRGGBB",
                  onChange: (event) => setDraft(event.target.value),
                }}
              />
              <Button
                size="small"
                title="Ajouter"
                iconId="fr-icon-check-line"
                disabled={!isColor(draft)}
                onClick={() => {
                  const color = draft.toLowerCase();
                  onAddColor(color);
                  select(color);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
