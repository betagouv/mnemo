"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import {
  snapMeasurement,
  type MeasurementTarget,
} from "./measurement-snapping";
import type { MeasurementViewer } from "./viewer-target";
import {
  distanceBetween,
  surfaceArea,
  type MeasurementKind,
  type Point3,
  type SceneMeasurement,
} from "./measurement-geometry";

export function useSceneMeasurements(
  getViewer: () => MeasurementViewer | null,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  mode: MeasurementKind | null,
  enabled: boolean,
) {
  const [measurements, setMeasurements] = useState<SceneMeasurement[]>([]);
  const [draft, setDraft] = useState<Point3[]>([]);
  const [cursor, setCursor] = useState<MeasurementTarget | null>(null);
  const [magnetic, setMagnetic] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(() => {
    setDraft([]);
    setCursor(null);
    setError(null);
  }, []);
  const undo = useCallback(() => {
    setDraft((points) => points.slice(0, -1));
    setError(null);
  }, []);

  const finish = useCallback(() => {
    if (mode !== "surface") return;
    const result = surfaceArea(draft);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setMeasurements((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        kind: "surface",
        points: draft,
        value: result.value,
      },
    ]);
    cancel();
  }, [draft, mode, cancel]);

  const [previousContext, setPreviousContext] = useState({ mode, enabled });
  if (previousContext.mode !== mode || previousContext.enabled !== enabled) {
    setPreviousContext({ mode, enabled });
    cancel();
  }

  useEffect(() => {
    const viewer = getViewer();
    const canvas = canvasRef.current;
    if (!mode || !enabled || !viewer || !canvas) return;
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    const coordinates = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };
    const pick = (x: number, y: number) =>
      snapMeasurement(viewer, x, y, magnetic, mode, draft, measurements);
    const preview = () => {
      frame = 0;
      if (pointer) setCursor(pick(pointer.x, pointer.y));
    };
    const move = (event: PointerEvent) => {
      if (event.buttons) {
        pointer = null;
        setCursor(null);
        return;
      }
      pointer = coordinates(event);
      if (!frame) frame = requestAnimationFrame(preview);
    };
    const leave = () => {
      pointer = null;
      setCursor(null);
    };
    const focus = () => canvas.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        undo();
      }
      if (event.key === "Enter" && mode === "surface") {
        event.preventDefault();
        finish();
      }
    };
    const unsubscribe = viewer.onMeasurementPick((x, y) => {
      if (magnetic && mode === "surface" && draft.length >= 3) {
        const start = viewer.projectWorldPoints([draft[0]!])[0];
        if (start && Math.hypot(start.x - x, start.y - y) <= 12) {
          finish();
          return;
        }
      }
      const hit = pick(x, y);
      if (!hit) {
        setError("Visez un point sur une géométrie visible.");
        return;
      }
      setCursor(hit);
      setError(null);
      const previous = draft.at(-1);
      if (previous && distanceBetween(previous, hit.point) < 1e-6) {
        setError("Choisissez un point différent du précédent.");
        return;
      }
      if (mode === "distance" && draft.length === 1) {
        setMeasurements((items) => [
          ...items,
          {
            id: crypto.randomUUID(),
            kind: mode,
            points: [draft[0]!, hit.point],
            value: distanceBetween(draft[0]!, hit.point),
          },
        ]);
        setDraft([]);
      } else setDraft((points) => [...points, hit.point]);
    });
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointerdown", focus);
    canvas.addEventListener("wheel", leave);
    canvas.addEventListener("keydown", key);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointerdown", focus);
      canvas.removeEventListener("wheel", leave);
      canvas.removeEventListener("keydown", key);
    };
  }, [
    getViewer,
    canvasRef,
    mode,
    enabled,
    magnetic,
    measurements,
    draft,
    finish,
    cancel,
    undo,
  ]);

  return {
    measurements,
    draft,
    cursor,
    magnetic,
    error,
    cancel,
    undo,
    finish,
    setMagnetic,
    remove: (id: string) =>
      setMeasurements((items) => items.filter((item) => item.id !== id)),
    clear: () => {
      setMeasurements([]);
      cancel();
    },
  };
}

export type SceneMeasurements = ReturnType<typeof useSceneMeasurements>;
