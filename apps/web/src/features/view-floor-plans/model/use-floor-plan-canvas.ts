"use client";

import type { FloorPlanRule } from "@mnemo/contracts/floor-plans";

import { useEffect, useRef, useState } from "react";
import {
  type FloorPlanDrawing,
  type FloorPlanPresetId,
} from "@mnemo/ifc-viewer-adapter";
import {
  fitPlan,
  planDistance,
  screenToPlan,
  zoomPlan,
  type PlanPoint,
  type PlanSegment,
  type PlanTransform,
} from "./floor-plan-navigation";
import { type PlanSnap } from "./floor-plan-snap";
import { styleFloorPlan, drawPlanMarks } from "./floor-plan-renderer";

import { prepareFloorPlan } from "./floor-plan-geometry";
import { FloorPlanSelection } from "./floor-plan-selection";
import { FloorPlanRaster } from "./floor-plan-raster";

export type PlanMeasurement = PlanSegment & { id: string };
type Commands = {
  style: (preset: FloorPlanPresetId, rules: readonly FloorPlanRule[]) => void;
  fit: () => void;
  clear: () => void;
  undo: () => void;
  cancel: () => void;
  refreshSelection: () => void;
  remove: (id: string) => void;
};

export function useFloorPlanCanvas(
  drawing: FloorPlanDrawing,
  measuring: boolean,
  preset: FloorPlanPresetId,
  rules: readonly FloorPlanRule[],
  selectedIds: readonly number[],
  onSelect: (expressId: number | null) => void,
  savedMeasurements: readonly PlanSegment[],
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const commands = useRef<Commands | null>(null);
  const modeRef = useRef(measuring);
  const styledDrawing = useRef<FloorPlanDrawing | null>(null);
  const selectionRef = useRef(selectedIds);
  const onSelectRef = useRef(onSelect);
  const [draftMeasurements, setDraftMeasurements] = useState<PlanMeasurement[]>(
    [],
  );
  const savedRef = useRef(savedMeasurements);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    const marks = overlay?.getContext("2d");
    if (!container || !canvas || !overlay || !ctx || !marks) return;

    const geometry = prepareFloorPlan(drawing);
    const snapping = geometry.snapping;
    const selection = new FloorPlanSelection(drawing, geometry);
    const initialStyle = styleFloorPlan(geometry, drawing, "default");
    let resolveStyle = initialStyle.resolve;
    const selectionColor =
      getComputedStyle(container)
        .getPropertyValue("--text-action-high-blue-france")
        .trim() || "#000091";
    const raster = new FloorPlanRaster(ctx, drawing.bounds, initialStyle);
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let navigating = false;
    let view: PlanTransform = { x: 0, y: 0, scale: 1 };
    let width = 0,
      height = 0,
      dpr = 1;
    let frame = 0,
      geometryDirty = true;
    let start: PlanPoint | null = null;
    let current: PlanPoint | null = null;
    let snap: PlanSnap | null = null;
    let hover: { x: number; y: number; alt: boolean; shift: boolean } | null =
      null;
    let down: {
      id: number;
      x: number;
      y: number;
      pan: boolean;
      view: PlanTransform;
      hadStart: boolean;
      selectable: boolean;
      dragged: boolean;
    } | null = null;
    let space = false;
    const measurements: PlanMeasurement[] = [];
    function resolvePointer() {
      if (!hover || !modeRef.current || down?.pan) {
        snap = null;
        return;
      }
      const raw = screenToPlan(hover, view);
      snap = hover.alt ? null : snapping.find(raw, view.scale);
      current = snap?.point ?? raw;
      if (start && hover.shift) {
        current =
          Math.abs(current.x - start.x) >= Math.abs(current.y - start.y)
            ? { x: current.x, y: start.y }
            : { x: start.x, y: current.y };
        if (snap && planDistance(current, snap.point) > 1e-8) snap = null;
      }
    }
    function render() {
      frame = 0;
      if (geometryDirty) {
        raster.draw(view, navigating);
        geometryDirty = false;
      }
      resolvePointer();
      drawPlanMarks(
        marks!,
        view,
        [...savedRef.current, ...measurements],
        start,
        current,
        snap,
        width,
        height,
        dpr,
      );
      selection.draw(
        marks!,
        selectionRef.current,
        view,
        dpr,
        resolveStyle,
        selectionColor,
      );
      if (statusRef.current)
        statusRef.current.textContent = snap
          ? snap.kind === "vertex"
            ? "Sommet accroché"
            : "Segment accroché"
          : modeRef.current
            ? "Point libre"
            : "";
      container!.style.cursor = down?.pan
        ? "grabbing"
        : modeRef.current
          ? "crosshair"
          : "grab";
    }
    function schedule(base = false) {
      geometryDirty ||= base;
      if (!frame) frame = requestAnimationFrame(render);
    }
    function settle() {
      clearTimeout(settleTimer);
      settleTimer = undefined;
      navigating = false;
      schedule(true);
    }
    function navigate() {
      navigating = true;
      clearTimeout(settleTimer);
      // A held pan stays in preview until release. Wheel bursts settle after a pause.
      if (!down?.pan) settleTimer = setTimeout(settle, 120);
      schedule(true);
    }
    function fit() {
      view = fitPlan(drawing.bounds, width, height);
      settle();
    }
    function cancel() {
      start = null;
      current = null;
      snap = null;
      schedule();
    }
    commands.current = {
      style: (preset, rules) => {
        const styled = styleFloorPlan(geometry, drawing, preset, rules);
        resolveStyle = styled.resolve;
        raster.style(styled);
        settle();
      },
      fit,
      cancel,
      refreshSelection: () => schedule(),
      remove: (id) => {
        const index = measurements.findIndex((item) => item.id === id);
        if (index >= 0) measurements.splice(index, 1);
        setDraftMeasurements([...measurements]);
        schedule();
      },
      clear: () => {
        measurements.length = 0;
        setDraftMeasurements([]);
        cancel();
      },
      undo: () => {
        measurements.pop();
        setDraftMeasurements([...measurements]);
        cancel();
      },
    };
    function updateHover(event: PointerEvent | WheelEvent) {
      const rect = container!.getBoundingClientRect();
      hover = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        alt: event.altKey,
        shift: event.shiftKey,
      };
    }
    function wheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();
      updateHover(event);
      const units =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
      const factor = Math.exp(
        Math.max(
          -Math.log(1.25),
          Math.min(
            Math.log(1.25),
            (-event.deltaY * units * Math.log(1.1)) / 100,
          ),
        ),
      );
      // zoomPlan's factor increases pixels per metre, anchoring the pointer.
      view = zoomPlan(view, hover!, factor);
      navigate();
    }
    function pointerDown(event: PointerEvent) {
      if (event.button !== 0 && event.button !== 1) return;
      if (down) return;
      event.preventDefault();
      container!.focus();
      updateHover(event);
      const pan = event.button === 1 || space || !modeRef.current;
      down = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        pan,
        view: { ...view },
        hadStart: Boolean(start),
        selectable: event.button === 0 && !space && !modeRef.current,
        dragged: false,
      };
      if (pan) clearTimeout(settleTimer);
      container!.setPointerCapture(event.pointerId);
      if (!pan) {
        resolvePointer();
        if (!start) start = current;
      }
      schedule();
    }
    function pointerMove(event: PointerEvent) {
      updateHover(event);
      if (down?.id === event.pointerId)
        down.dragged ||=
          Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4;
      if (down?.id === event.pointerId && down.pan && down.dragged) {
        view = {
          ...view,
          x: down.view.x + event.clientX - down.x,
          y: down.view.y + event.clientY - down.y,
        };
        navigate();
      } else schedule();
    }
    function pointerUp(event: PointerEvent) {
      if (!down || down.id !== event.pointerId) return;
      updateHover(event);
      const completed = down;
      const dragged =
        completed.dragged ||
        Math.hypot(event.clientX - completed.x, event.clientY - completed.y) >
          4;
      if (completed.selectable && !dragged)
        onSelectRef.current(
          selection.pick(screenToPlan(hover!, view), view.scale, resolveStyle),
        );
      if (!completed.pan) {
        resolvePointer();
        if (
          (completed.hadStart || dragged) &&
          start &&
          current &&
          planDistance(start, current) * view.scale > 1
        ) {
          measurements.push({ id: crypto.randomUUID(), start, end: current });
          setDraftMeasurements([...measurements]);
          start = null;
        }
      }
      down = null;
      if (completed.pan) settle();
      container!.releasePointerCapture(event.pointerId);
      schedule();
    }
    function cancelPointer() {
      settle();
      down = null;
      cancel();
    }
    function lostCapture() {
      if (down?.pan) settle();
      down = null;
      schedule();
    }
    function leave() {
      if (!down) {
        hover = null;
        snap = null;
        schedule();
      }
    }
    function keyDown(event: KeyboardEvent) {
      if (event.code === "Space") {
        event.preventDefault();
        space = true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
        if (!modeRef.current) onSelectRef.current(null);
      }
      if (event.key === "Home" || event.key.toLowerCase() === "f") {
        event.preventDefault();
        fit();
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        commands.current?.undo();
      }
      if (hover) {
        hover.shift = event.shiftKey;
        hover.alt = event.altKey;
        schedule();
      }
    }
    function keyUp(event: KeyboardEvent) {
      if (event.code === "Space") space = false;
      if (hover) {
        hover.shift = event.shiftKey;
        hover.alt = event.altKey;
        schedule();
      }
    }
    function blur() {
      settle();
      space = false;
      down = null;
      cancel();
    }
    function doubleClick() {
      if (!modeRef.current) fit();
    }
    const observer = new ResizeObserver(() => {
      const rect = container!.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const first = width === 0;
      view.x += (rect.width - width) / 2;
      view.y += (rect.height - height) / 2;
      width = rect.width;
      height = rect.height;
      dpr = window.devicePixelRatio || 1;
      for (const target of [canvas!, overlay!]) {
        target.width = Math.round(width * dpr);
        target.height = Math.round(height * dpr);
      }
      raster.resize(width, height, dpr);
      if (first) fit();
      else settle();
    });
    observer.observe(container);
    container.addEventListener("wheel", wheel, { passive: false });
    container.addEventListener("pointerdown", pointerDown);
    container.addEventListener("pointermove", pointerMove);
    container.addEventListener("pointerup", pointerUp);
    container.addEventListener("pointercancel", cancelPointer);
    container.addEventListener("lostpointercapture", lostCapture);
    container.addEventListener("pointerleave", leave);
    container.addEventListener("keydown", keyDown);
    container.addEventListener("keyup", keyUp);
    container.addEventListener("blur", blur);
    container.addEventListener("dblclick", doubleClick);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
      raster.clear();
      observer.disconnect();
      commands.current = null;
      styledDrawing.current = null;
      container.removeEventListener("wheel", wheel);
      container.removeEventListener("pointerdown", pointerDown);
      container.removeEventListener("pointermove", pointerMove);
      container.removeEventListener("pointerup", pointerUp);
      container.removeEventListener("pointercancel", cancelPointer);
      container.removeEventListener("lostpointercapture", lostCapture);
      container.removeEventListener("pointerleave", leave);
      container.removeEventListener("keydown", keyDown);
      container.removeEventListener("keyup", keyUp);
      container.removeEventListener("blur", blur);
      container.removeEventListener("dblclick", doubleClick);
    };
  }, [drawing]);

  useEffect(() => {
    if (styledDrawing.current !== drawing) {
      styledDrawing.current = drawing;
      commands.current?.style(preset, rules);
      return;
    }
    // Keep editing responsive. Saving and exporting still use the latest rules.
    const timer = setTimeout(
      () => commands.current?.style(preset, rules),
      1000,
    );
    return () => clearTimeout(timer);
  }, [drawing, preset, rules]);

  useEffect(() => {
    selectionRef.current = selectedIds;
    onSelectRef.current = onSelect;
    commands.current?.refreshSelection();
  }, [selectedIds, onSelect]);

  useEffect(() => {
    savedRef.current = savedMeasurements;
    commands.current?.refreshSelection();
  }, [savedMeasurements]);

  useEffect(() => {
    modeRef.current = measuring;
    commands.current?.cancel();
  }, [measuring]);
  return {
    containerRef,
    canvasRef,
    overlayRef,
    statusRef,
    count: draftMeasurements.length + savedMeasurements.length,
    draftMeasurements,
    remove: (id: string) => commands.current?.remove(id),
    fit: () => commands.current?.fit(),
    undo: () => commands.current?.undo(),
    clear: () => commands.current?.clear(),
  };
}
