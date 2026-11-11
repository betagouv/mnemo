"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMeasurementContext } from "../model/measurement-context";
import {
  distanceBetween,
  formatMeasurement,
} from "../model/measurement-geometry";
import styles from "./measurement-overlay.module.css";

const cursorLabels = {
  measurement: "Point de mesure",
  axis: "Axe",
  perpendicular: "Perpendiculaire",
  plane: "Même plan",
  vertex: "Sommet",
  edge: "Arête",
  surface: "Surface",
  point_cloud: "Point",
};

export function MeasurementOverlay() {
  const { getViewer, controller, mode } = useMeasurementContext();
  const { measurements, draft, cursor } = controller;
  const elements = useRef(new Map<string, SVGGElement>());
  const shapes = useMemo(() => {
    const result = measurements.map((item, index) => ({
      id: item.id,
      points: item.points,
      closed: item.kind === "surface",
      label: `${index + 1} · ${formatMeasurement(item.value, item.kind)}`,
      draft: false,
    }));
    const preview =
      draft.length && cursor && mode ? [...draft, cursor.point] : draft;
    if (preview.length)
      result.push({
        id: "draft",
        points: preview,
        closed: mode === "surface" && preview.length >= 3,
        label:
          mode === "distance" && preview.length === 2
            ? formatMeasurement(
                distanceBetween(preview[0]!, preview[1]!),
                "distance",
              )
            : "",
        draft: true,
      });
    if (cursor?.guide && mode)
      result.push({
        id: "guide",
        points: [cursor.guide, cursor.point],
        closed: false,
        label: "",
        draft: true,
      });
    if (cursor && mode)
      result.push({
        id: "cursor",
        points: [cursor.point],
        closed: false,
        label: cursorLabels[cursor.kind],
        draft: true,
      });
    return result;
  }, [measurements, draft, cursor, mode]);

  useEffect(() => {
    if (!shapes.length) return;
    const points = shapes.flatMap((shape) => shape.points);
    let frame = 0;
    const project = () => {
      // Project in one batch, without rerendering React during camera gestures.
      const projected = getViewer()?.projectWorldPoints(points) ?? [];
      let offset = 0;
      for (const shape of shapes) {
        const group = elements.current.get(shape.id);
        const positions = projected.slice(offset, offset + shape.points.length);
        offset += shape.points.length;
        if (!group) continue;
        const visible =
          positions.length === shape.points.length &&
          positions.every((point) => point !== null);
        group.style.visibility = visible ? "visible" : "hidden";
        if (!visible) continue;
        const coordinates = positions.map((point) => `${point!.x},${point!.y}`);
        if (shape.closed) coordinates.push(coordinates[0]!);
        group
          .querySelector("polyline")
          ?.setAttribute("points", coordinates.join(" "));
        const circles = group.querySelectorAll("circle");
        positions.forEach((point, index) => {
          circles[index]?.setAttribute("cx", String(point!.x));
          circles[index]?.setAttribute("cy", String(point!.y));
        });
        const label = group.querySelector("text");
        label?.setAttribute(
          "x",
          String(
            positions.reduce((sum, point) => sum + point!.x, 0) /
              positions.length,
          ),
        );
        label?.setAttribute(
          "y",
          String(
            positions.reduce((sum, point) => sum + point!.y, 0) /
              positions.length -
              12,
          ),
        );
      }
      frame = requestAnimationFrame(project);
    };
    frame = requestAnimationFrame(project);
    return () => cancelAnimationFrame(frame);
  }, [getViewer, shapes]);

  return (
    <svg className={styles.root} aria-hidden="true">
      {shapes.map((shape) => (
        <g
          key={shape.id}
          data-draft={shape.draft || undefined}
          ref={(element) => {
            if (element) elements.current.set(shape.id, element);
            else elements.current.delete(shape.id);
          }}
        >
          <polyline className={shape.closed ? styles.surface : styles.line} />
          {shape.points.map((_, index) => (
            <circle
              key={index}
              r={shape.id === "cursor" ? 6 : 4}
              className={styles.point}
            />
          ))}
          <text className={styles.label} textAnchor="middle">
            {shape.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
