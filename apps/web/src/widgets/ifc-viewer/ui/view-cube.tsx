"use client";

import { SegmentedControl } from "@codegouvfr/react-dsfr/SegmentedControl";
import type {
  IfcViewerController,
  IfcViewerPhase,
  ViewerPresetView,
  ViewerProjectionMode,
} from "@mnemo/ifc-viewer-adapter";
import { useEffect, useRef, useState } from "react";

import styles from "./view-cube.module.css";

const faces: { view: ViewerPresetView; label: string; shortLabel: string }[] = [
  { view: "front", label: "Vue de face", shortLabel: "Face" },
  { view: "back", label: "Vue arrière", shortLabel: "Arrière" },
  { view: "top", label: "Vue de dessus", shortLabel: "Dessus" },
  { view: "bottom", label: "Vue de dessous", shortLabel: "Dessous" },
  { view: "right", label: "Vue de droite", shortLabel: "Droite" },
  { view: "left", label: "Vue de gauche", shortLabel: "Gauche" },
];

function ProjectionIcon({ mode }: { mode: ViewerProjectionMode }) {
  return mode === "orthographic" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M3 7h13v13H3zM8 3h13v13M3 7l5-4m8 4 5-4m-5 17 5-4" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M3 4h18v16H3zM8 8h8v8H8zM3 4l5 4m13-4-5 4M3 20l5-4m13 4-5-4" />
    </svg>
  );
}
/** Camera readout stays outside React state so orbiting never rerenders the viewer. */
export function ViewCube({
  getViewer,
  phase,
  projectId,
}: {
  getViewer: () => IfcViewerController | null;
  phase: IfcViewerPhase;
  projectId: string;
}) {
  const cubeRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    dragging: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [projectionMode, setProjectionMode] =
    useState<ViewerProjectionMode>("perspective");

  useEffect(() => {
    const viewer = getViewer();
    if (!viewer) return;
    const unsubscribeRotation = viewer.subscribeCameraRotation(
      ({ azimuth, elevation }) => {
        if (cubeRef.current) {
          cubeRef.current.style.transform = `rotateX(${-elevation}deg) rotateY(${-azimuth}deg)`;
        }
      },
    );
    const unsubscribeProjection =
      viewer.subscribeProjectionMode(setProjectionMode);
    return () => {
      unsubscribeRotation();
      unsubscribeProjection();
    };
  }, [getViewer, phase, projectId]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (
        !gesture.dragging &&
        Math.hypot(
          event.clientX - gesture.startX,
          event.clientY - gesture.startY,
        ) > 4
      ) {
        gesture.dragging = true;
      }
      if (gesture.dragging) {
        suppressClickRef.current = true;
        getViewer()?.orbitFromViewCube(
          (event.clientX - gesture.x) * 2,
          (event.clientY - gesture.y) * 2,
        );
      }
      gesture.x = event.clientX;
      gesture.y = event.clientY;
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      if (event.type === "pointercancel") {
        suppressClickRef.current = false;
      } else {
        // A click follows pointerup synchronously; clear suppression afterwards.
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
    };
  }, [getViewer]);

  return (
    <nav
      aria-label="Orientation de la vue 3D"
      className={styles.container}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = false;
      }}
    >
      <div
        className={styles.perspective}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          gestureRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            x: event.clientX,
            y: event.clientY,
            dragging: false,
          };
        }}
        title="Cliquez sur une face ou glissez pour orienter la scène"
      >
        <div className={styles.cube} ref={cubeRef}>
          {faces.map(({ view, label, shortLabel }) => (
            <button
              aria-label={label}
              className={`${styles.face} ${styles[view]}`}
              key={view}
              onClick={() => getViewer()?.setPresetView(view)}
              title={label}
              type="button"
            >
              {shortLabel}
            </button>
          ))}
        </div>
      </div>
      <SegmentedControl
        className={styles.projectionControl}
        hideLegend
        legend="Type de projection"
        segments={[
          {
            label: (
              <>
                <ProjectionIcon mode="orthographic" />
                <span>Ortho</span>
              </>
            ),
            nativeInputProps: {
              "aria-label": "Projection orthographique",
              checked: projectionMode === "orthographic",
              onChange: () => getViewer()?.setProjectionMode("orthographic"),
              value: "orthographic",
            },
          },
          {
            label: (
              <>
                <ProjectionIcon mode="perspective" />
                <span>Persp.</span>
              </>
            ),
            nativeInputProps: {
              "aria-label": "Projection perspective",
              checked: projectionMode === "perspective",
              onChange: () => getViewer()?.setProjectionMode("perspective"),
              value: "perspective",
            },
          },
        ]}
        small
      />
      <button
        className={styles.fitButton}
        onClick={() => getViewer()?.fitToView()}
        title="Tout cadrer"
        type="button"
      >
        <span className="fr-icon-focus-3-line" aria-hidden="true" />
        Tout cadrer
      </button>
    </nav>
  );
}
