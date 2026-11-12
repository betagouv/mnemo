"use client";

import type { MeasurementEditorSlot } from "@/entities/measurement";

import {
  createContext,
  useContext,
  type ReactNode,
  type RefObject,
} from "react";
import type { MeasurementKind } from "@mnemo/domain/measurement";
import type { MeasurementViewer } from "./viewer-target";
import {
  useSceneMeasurements,
  type SceneMeasurements,
} from "./use-scene-measurements";

type MeasurementContextValue = {
  Editor: MeasurementEditorSlot;
  controller: SceneMeasurements;
  getViewer: () => MeasurementViewer | null;
  mode: MeasurementKind | null;
  enabled: boolean;
  onModeChange: (mode: MeasurementKind) => void;
};
const MeasurementContext = createContext<MeasurementContextValue | null>(null);

/** Pointer updates only rerender this feature's consumers. */
export function SceneMeasurementProvider({
  children,
  Editor,
  getViewer,
  canvasRef,
  mode,
  enabled,
  onModeChange,
}: {
  children: ReactNode;
  Editor: MeasurementEditorSlot;
  getViewer: () => MeasurementViewer | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  mode: MeasurementKind | null;
  enabled: boolean;
  onModeChange: (mode: MeasurementKind) => void;
}) {
  const controller = useSceneMeasurements(getViewer, canvasRef, mode, enabled);
  return (
    <MeasurementContext.Provider
      value={{ Editor, controller, getViewer, mode, enabled, onModeChange }}
    >
      {children}
    </MeasurementContext.Provider>
  );
}

export function useMeasurementContext() {
  const value = useContext(MeasurementContext);
  if (!value) throw new Error("SceneMeasurementProvider is required");
  return value;
}
