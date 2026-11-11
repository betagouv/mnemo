"use client";

import {
  createContext,
  useContext,
  type ReactNode,
  type RefObject,
} from "react";
import type { MeasurementKind } from "./measurement-geometry";
import type { MeasurementViewer } from "./viewer-target";
import {
  useSceneMeasurements,
  type SceneMeasurements,
} from "./use-scene-measurements";

type MeasurementContextValue = {
  controller: SceneMeasurements;
  getViewer: () => MeasurementViewer | null;
  mode: MeasurementKind | null;
  enabled: boolean;
};
const MeasurementContext = createContext<MeasurementContextValue | null>(null);

/** Pointer updates only rerender this feature's consumers. */
export function SceneMeasurementProvider({
  children,
  getViewer,
  canvasRef,
  mode,
  enabled,
}: {
  children: ReactNode;
  getViewer: () => MeasurementViewer | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  mode: MeasurementKind | null;
  enabled: boolean;
}) {
  const controller = useSceneMeasurements(getViewer, canvasRef, mode, enabled);
  return (
    <MeasurementContext.Provider
      value={{ controller, getViewer, mode, enabled }}
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
