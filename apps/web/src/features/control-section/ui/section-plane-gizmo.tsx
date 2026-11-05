"use client";

import type {
  IfcSectionSnapshot,
  IfcViewerController,
} from "@mnemo/ifc-viewer-adapter";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  draggedSectionDistance,
  sectionPlaneCorners,
  projectSectionGizmo,
  sectionGizmoAxis,
} from "../model/section-gizmo-geometry";

import { SectionArrow } from "./section-arrow";
import styles from "./section-gizmo.module.css";

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
  const [active, setActive] = useState(false);
  const axis = sectionGizmoAxis(plane);
  const outlineRef = useRef<SVGPolygonElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
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
      const handle = handleRef.current;
      if (handle) {
        handle.style.visibility = projection?.screenNormal
          ? "visible"
          : "hidden";
        if (projection) {
          handle.style.left = `${projection.foot.x - 16}px`;
          handle.style.top = `${projection.foot.y - 22}px`;
          handle.style.transform = `rotate(${projection.angle}rad)`;
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
    setActive(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className={styles.root}>
      <svg aria-hidden="true" className={styles.outlines}>
        <polygon ref={outlineRef} data-axis={axis} data-active={active} />
      </svg>
      <SectionArrow
        aria-label="Déplacer le plan de coupe"
        data-axis={axis}
        data-active={active}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        onPointerEnter={() => setActive(true)}
        onPointerLeave={() => {
          if (!dragRef.current) setActive(false);
        }}
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
          if (event.button !== 0) return;
          const projection = projectionRef.current;
          if (!projection?.screenNormal) return;
          event.preventDefault();
          event.stopPropagation();
          setActive(true);
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
          setActive(false);
        }}
        ref={handleRef}
        title="Glisser pour déplacer le plan · flèches haut/bas au clavier"
        type="button"
      />
    </div>
  );
}
