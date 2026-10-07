"use client";

import type {
  IfcSectionSnapshot,
  IfcViewerController,
} from "@mnemo/ifc-viewer-adapter";
import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  draggedSectionDistance,
  sectionPlaneCorners,
  projectSectionGizmo,
} from "../model/section-gizmo-geometry";

import styles from "./section-plane-gizmo.module.css";

type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  startDistance: number;
  startPosition: number;
  span: number | null;
  screenNormal: { x: number; y: number };
  pixelsPerMeter: number;
};

export function SectionPlaneGizmo({
  getViewer,
  plane,
}: {
  getViewer: () => IfcViewerController | null;
  plane: IfcSectionSnapshot["plane"];
}) {
  const arrowRef = useRef<SVGSVGElement>(null);
  const outlineRef = useRef<SVGPolygonElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLOutputElement>(null);
  const planeRef = useRef(plane);
  const projectionRef = useRef<ReturnType<typeof projectSectionGizmo>>(null);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    planeRef.current = plane;
  }, [plane]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const viewer = getViewer();
      const projection = viewer
        ? projectSectionGizmo(
            planeRef.current,
            viewer.getSectionBounds(),
            (point) => viewer.projectWorldPoint(point),
          )
        : null;
      projectionRef.current = projection;
      const outline = outlineRef.current;
      if (viewer && outline) {
        const corners = sectionPlaneCorners(
          planeRef.current,
          viewer.getSectionBounds(),
        );
        const projected = corners ? viewer.projectWorldPoints(corners) : null;
        const visible = projected?.every(Boolean) ?? false;
        outline.style.visibility = visible ? "visible" : "hidden";
        if (visible && projected)
          outline.setAttribute(
            "points",
            projected.map((point) => `${point!.x},${point!.y}`).join(" "),
          );
      }
      const arrow = arrowRef.current;
      const handle = handleRef.current;
      const label = labelRef.current;
      if (arrow && handle) {
        const visible = projection !== null;
        arrow.style.visibility =
          visible && projection.screenNormal ? "visible" : "hidden";
        handle.style.visibility = visible ? "visible" : "hidden";
        if (label) label.style.visibility = visible ? "visible" : "hidden";
        if (projection) {
          arrow.style.left = `${projection.foot.x - 8}px`;
          arrow.style.top = `${projection.foot.y - 10}px`;
          arrow.style.transform = `rotate(${projection.angle}rad)`;
          handle.style.left = `${projection.foot.x - 12}px`;
          handle.style.top = `${projection.foot.y - 12}px`;
          if (label) {
            label.style.left = `${projection.foot.x + 26}px`;
            label.style.top = `${projection.foot.y - 14}px`;
            label.textContent = `${projection.distance.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m`;
          }
        }
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [getViewer]);

  const stopDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className={styles.root}>
      <svg aria-hidden="true" className={styles.outline}>
        <polygon ref={outlineRef} />
      </svg>
      <svg
        aria-hidden="true"
        className={styles.arrow}
        ref={arrowRef}
        viewBox="0 0 72 20"
      >
        <line
          x1="8"
          x2="60"
          y1="10"
          y2="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path d="M56 4 L69 10 L56 16 Z" fill="currentColor" />
      </svg>
      <button
        aria-label="Déplacer le plan de coupe"
        className={styles.handle}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const projection = projectionRef.current;
          if (!projection) return;
          const step = event.shiftKey ? 1 : 0.1;
          if (planeRef.current.source === "axis") {
            if (!projection.span) return;
            getViewer()?.setSectionPosition(
              planeRef.current.position +
                ((event.key === "ArrowUp" ? step : -step) * 100) /
                  projection.span,
            );
          } else {
            getViewer()?.setSectionCustomDistance(
              projection.distance + (event.key === "ArrowUp" ? step : -step),
            );
          }
        }}
        onPointerCancel={stopDrag}
        onPointerDown={(event) => {
          const projection = projectionRef.current;
          if (!projection?.screenNormal) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startDistance: projection.distance,
            startPosition: planeRef.current.position,
            span: projection.span,
            screenNormal: projection.screenNormal,
            pixelsPerMeter: projection.pixelsPerMeter,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (drag?.pointerId !== event.pointerId) return;
          event.stopPropagation();
          const deltaX = event.clientX - drag.startX;
          const deltaY = event.clientY - drag.startY;
          const distance = draggedSectionDistance(
            drag.startDistance,
            { x: deltaX, y: deltaY },
            drag.screenNormal,
            drag.pixelsPerMeter,
          );
          if (distance !== null) {
            if (planeRef.current.source === "axis") {
              if (drag.span)
                getViewer()?.setSectionPosition(
                  drag.startPosition +
                    ((distance - drag.startDistance) * 100) / drag.span,
                );
            } else {
              getViewer()?.setSectionCustomDistance(distance);
            }
          }
        }}
        onPointerUp={stopDrag}
        onLostPointerCapture={() => {
          dragRef.current = null;
        }}
        ref={handleRef}
        title="Glisser pour déplacer le plan · flèches haut/bas au clavier"
        type="button"
      />
      <output
        aria-label="Position du plan de coupe"
        className={styles.label}
        ref={labelRef}
      />
    </div>
  );
}
