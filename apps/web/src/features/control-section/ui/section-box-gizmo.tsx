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
  draggedBoxFaceValue,
  sectionBoxFaces,
} from "../model/section-box-geometry";

import { SectionArrow } from "./section-arrow";
import styles from "./section-gizmo.module.css";

type Box = NonNullable<IfcSectionSnapshot["box"]>;
type Projection = {
  screenNormal: { x: number; y: number };
  pixelsPerMeter: number;
} | null;
type Drag = {
  pointerId: number;
  faceIndex: number;
  startX: number;
  startY: number;
  startValue: number;
  sign: -1 | 1;
  projection: NonNullable<Projection>;
};

const faceNames = ["gauche", "droite", "bas", "haut", "arrière", "avant"];

export function SectionBoxGizmo({
  box,
  getViewer,
}: {
  box: Box;
  getViewer: () => IfcViewerController | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeFace, setActiveFace] = useState<number | null>(null);
  const boxRef = useRef(box);
  const projectedRef = useRef<Projection[]>([]);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    boxRef.current = box;
  }, [box]);

  useEffect(() => {
    let frame = 0;
    let lastProjection = "";
    const update = () => {
      const viewer = getViewer();
      const root = rootRef.current;
      if (viewer && root) {
        const faces = sectionBoxFaces(boxRef.current);
        const points = faces.flatMap((face) => [
          face.center,
          face.tip,
          ...face.corners,
        ]);
        const projected = viewer.projectWorldPoints(points);
        const signature = JSON.stringify(projected);
        if (signature === lastProjection) {
          frame = requestAnimationFrame(update);
          return;
        }
        lastProjection = signature;
        const outlines =
          root.querySelectorAll<SVGPolygonElement>("[data-box-outline]");
        const handles =
          root.querySelectorAll<HTMLButtonElement>("[data-box-handle]");
        projectedRef.current = faces.map((_, index) => {
          const start = index * 6;
          const center = projected[start];
          const tip = projected[start + 1];
          const corners = projected.slice(start + 2, start + 6);
          const outline = outlines[index];
          const handle = handles[index];
          if (outline) {
            const visible = corners.every(Boolean);
            outline.style.visibility = visible ? "visible" : "hidden";
            if (visible)
              outline.setAttribute(
                "points",
                corners.map((point) => `${point!.x},${point!.y}`).join(" "),
              );
          }
          if (!center || !tip || !handle) {
            if (handle) handle.style.visibility = "hidden";
            return null;
          }
          const dx = tip.x - center.x;
          const dy = tip.y - center.y;
          const pixelsPerMeter = Math.hypot(dx, dy);
          handle.style.visibility =
            pixelsPerMeter > 1e-3 ? "visible" : "hidden";
          handle.style.left = `${center.x - 16}px`;
          handle.style.top = `${center.y - 22}px`;
          handle.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
          return pixelsPerMeter > 1e-3
            ? {
                screenNormal: {
                  x: dx / pixelsPerMeter,
                  y: dy / pixelsPerMeter,
                },
                pixelsPerMeter,
              }
            : null;
        });
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [getViewer]);

  const stopDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setActiveFace(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <svg aria-hidden="true" className={styles.outlines}>
        {faceNames.map((name, index) => (
          <polygon
            data-box-outline
            data-axis={["x", "y", "z"][Math.floor(index / 2)]}
            data-active={activeFace === index}
            key={name}
          />
        ))}
      </svg>
      {faceNames.map((name, index) => (
        <SectionArrow
          aria-label={`Déplacer la face ${name} de la boîte de coupe`}
          data-box-handle
          data-axis={["x", "y", "z"][Math.floor(index / 2)]}
          data-active={activeFace === index}
          key={name}
          onFocus={() => setActiveFace(index)}
          onBlur={() => setActiveFace(null)}
          onPointerEnter={() => setActiveFace(index)}
          onPointerLeave={() => {
            if (!dragRef.current) setActiveFace(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const face = sectionBoxFaces(boxRef.current)[index];
            if (!face) return;
            const step = event.shiftKey ? 1 : 0.1;
            getViewer()?.moveSectionBoxFace(
              face.axis,
              face.side,
              face.value + face.sign * (event.key === "ArrowUp" ? step : -step),
            );
          }}
          onPointerCancel={stopDrag}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const face = sectionBoxFaces(boxRef.current)[index];
            const projection = projectedRef.current[index];
            if (!face || !projection) return;
            event.preventDefault();
            event.stopPropagation();
            setActiveFace(index);
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = {
              pointerId: event.pointerId,
              faceIndex: index,
              startX: event.clientX,
              startY: event.clientY,
              startValue: face.value,
              sign: face.sign,
              projection,
            };
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (
              !drag ||
              drag.pointerId !== event.pointerId ||
              drag.faceIndex !== index
            )
              return;
            event.stopPropagation();
            const face = sectionBoxFaces(boxRef.current)[index];
            if (!face) return;
            const value = draggedBoxFaceValue(
              drag.startValue,
              drag.sign,
              {
                x: event.clientX - drag.startX,
                y: event.clientY - drag.startY,
              },
              drag.projection.screenNormal,
              drag.projection.pixelsPerMeter,
            );
            if (value !== null)
              getViewer()?.moveSectionBoxFace(face.axis, face.side, value);
          }}
          onPointerUp={stopDrag}
          onLostPointerCapture={() => {
            dragRef.current = null;
            setActiveFace(null);
          }}
          title={`Glisser la face ${name} · flèches haut/bas au clavier`}
          type="button"
        />
      ))}
    </div>
  );
}
