"use client";

import Select from "@codegouvfr/react-dsfr/Select";
import {
  floorPlanPresets,
  type FloorPlanPresetId,
} from "@mnemo/ifc-viewer-adapter";

export function FloorPlanStyleSelect({
  value,
  onChange,
}: {
  value: FloorPlanPresetId;
  onChange: (value: FloorPlanPresetId) => void;
}) {
  return (
    <Select
      className="mb-0 min-w-48"
      label="Style du plan"
      hint={
        value === "structural"
          ? "Éléments porteurs selon les classes IFC et la propriété LoadBearing. Vue vers le plancher bas."
          : undefined
      }
      nativeSelectProps={{
        "aria-label": "Style du plan",
        value,
        onChange: (event) => {
          const preset = floorPlanPresets.find(
            (item) => item.id === event.target.value,
          );
          if (preset) onChange(preset.id);
        },
      }}
    >
      {floorPlanPresets.map((preset) => (
        <option key={preset.id} value={preset.id}>
          {preset.label}
        </option>
      ))}
    </Select>
  );
}
