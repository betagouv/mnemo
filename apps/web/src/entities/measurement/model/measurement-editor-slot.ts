import type { ComponentType } from "react";
import type { SaveMeasurementInput } from "@mnemo/contracts/measurements";
export type MeasurementEditorSlot = ComponentType<{
  measurement: Omit<SaveMeasurementInput, "projectId">;
  onSaved?: () => void;
  onDiscard?: () => void;
}>;
