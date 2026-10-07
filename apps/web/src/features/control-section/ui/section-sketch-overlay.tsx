"use client";

import type {
  IfcSectionSnapshot,
  IfcViewerController,
} from "@mnemo/ifc-viewer-adapter";
import { useEffect, useRef, type RefObject } from "react";

import styles from "./section-sketch-overlay.module.css";

type ScreenPoint = { x: number; y: number };

export function SectionSketchOverlay({
  canvasRef,
  getViewer,
  section,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  getViewer: () => IfcViewerController | null;
  section: IfcSectionSnapshot;
}) {
  const sectionRef = useRef(section);
  const pointerRef = useRef<ScreenPoint | null>(null);
  const startRef = useRef<SVGCircleElement>(null);
  const endRef = useRef<SVGCircleElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const cursorRef = useRef<SVGCircleElement>(null);
  const cursorLabelRef = useRef<SVGTextElement>(null);
  const firstLabelRef = useRef<SVGTextElement>(null);
  const secondLabelRef = useRef<SVGTextElement>(null);

  useEffect(() => {
    sectionRef.current = section;
  }, [section]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointerRef.current = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
    };
    const onLeave = () => {
      pointerRef.current = null;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [canvasRef]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const viewer = getViewer();
      const current = sectionRef.current;
      const drafting = current.pickMode === "two-point";
      const finished =
        current.active === "plane" &&
        current.plane.source === "two-point" &&
        current.trace;
      const start = drafting
        ? current.draftPoint
        : finished
          ? finished.start
          : null;
      const end = finished && !drafting ? finished.end : null;
      const normal = current.plane.normal;
      const distance = current.plane.distance;
      const offset =
        end && start && normal && distance !== null
          ? distance -
            (start[0] * normal[0] + start[1] * normal[1] + start[2] * normal[2])
          : 0;
      const points = [start, end].map((point) =>
        point && normal && offset
          ? {
              x: point[0] + offset * normal[0],
              y: point[1] + offset * normal[1],
              z: point[2] + offset * normal[2],
            }
          : point
            ? { x: point[0], y: point[1], z: point[2] }
            : null,
      );
      const [startScreen, endScreen] = viewer
        ? viewer.projectWorldPoints(
            points.filter((point): point is NonNullable<typeof point> =>
              Boolean(point),
            ),
          )
        : [];
      const first = start ? startScreen : null;
      const second = end
        ? endScreen
        : drafting && first
          ? pointerRef.current
          : null;
      const cursor = current.pickMode ? pointerRef.current : null;
      const position = (
        element: SVGCircleElement | null,
        point: ScreenPoint | null | undefined,
      ) => {
        if (!element) return;
        element.style.visibility = point ? "visible" : "hidden";
        if (point) {
          element.setAttribute("cx", `${point.x}`);
          element.setAttribute("cy", `${point.y}`);
        }
      };
      position(startRef.current, first);
      position(endRef.current, second);
      position(cursorRef.current, cursor);
      const line = lineRef.current;
      if (line) {
        line.style.visibility = first && second ? "visible" : "hidden";
        line.style.strokeDasharray = drafting ? "6 5" : "none";
        if (first && second) {
          line.setAttribute("x1", `${first.x}`);
          line.setAttribute("y1", `${first.y}`);
          line.setAttribute("x2", `${second.x}`);
          line.setAttribute("y2", `${second.y}`);
        }
      }
      for (const [label, point] of [
        [firstLabelRef.current, first],
        [secondLabelRef.current, second],
        [cursorLabelRef.current, drafting && !first ? cursor : null],
      ] as const) {
        if (!label) continue;
        label.style.visibility = point ? "visible" : "hidden";
        if (point) {
          label.setAttribute("x", `${point.x + 12}`);
          label.setAttribute("y", `${point.y - 10}`);
        }
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [getViewer]);

  return (
    <svg aria-hidden="true" className={styles.root}>
      <line className={styles.line} ref={lineRef} />
      <circle className={styles.point} r="8" ref={startRef} />
      <circle className={styles.point} r="8" ref={endRef} />
      <circle className={styles.cursor} r="13" ref={cursorRef} />
      <text className={styles.label} ref={firstLabelRef}>
        1
      </text>
      <text className={styles.label} ref={secondLabelRef}>
        2
      </text>
      <text className={styles.label} ref={cursorLabelRef}>
        1
      </text>
    </svg>
  );
}
