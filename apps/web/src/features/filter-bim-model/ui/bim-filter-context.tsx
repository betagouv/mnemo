"use client";
import Checkbox from "@codegouvfr/react-dsfr/Checkbox";
import Range from "@codegouvfr/react-dsfr/Range";
import {
  MIN_ISOLATION_CONTEXT_OPACITY,
  type BimFilterSettings,
} from "@mnemo/contracts/bim-filters";
import styles from "./bim-filter-panel.module.css";

export function BimFilterContext({
  settings,
  onChange,
}: {
  settings: BimFilterSettings;
  onChange: (settings: BimFilterSettings) => void;
}) {
  return (
    <div className={styles.context}>
      <h3>Contexte d’isolement</h3>
      <Checkbox
        small
        options={[
          {
            label: "Garder le reste en transparence",
            nativeInputProps: {
              checked: settings.showContext,
              onChange: (event) =>
                onChange({ ...settings, showContext: event.target.checked }),
            },
          },
        ]}
      />
      <Range
        small
        label="Opacité du contexte"
        min={MIN_ISOLATION_CONTEXT_OPACITY * 100}
        max={50}
        suffix=" %"
        disabled={!settings.showContext}
        nativeInputProps={{
          value: Math.round(settings.contextOpacity * 100),
          onChange: (event) =>
            onChange({
              ...settings,
              contextOpacity: Number(event.target.value) / 100,
            }),
        }}
      />
    </div>
  );
}
