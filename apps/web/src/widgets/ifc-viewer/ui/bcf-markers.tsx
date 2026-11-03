"use client";
import { useEffect, useMemo, useRef } from "react";
import type { BcfMarkerTopic } from "@mnemo/contracts/bcf";
import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";
import Button from "@codegouvfr/react-dsfr/Button";
import styles from "./bcf-markers.module.css";
export function BcfMarkers({
  topics,
  getViewer,
  onSelect,
  activeId,
}: {
  topics: BcfMarkerTopic[];
  getViewer: () => IfcViewerController | null;
  onSelect: (id: string) => void;
  activeId: string | null;
}) {
  const elements = useRef(new Map<string, HTMLButtonElement>());
  const markers = useMemo(
    () => getViewer()?.bcfMarkers(topics) ?? [],
    [topics, getViewer],
  );
  useEffect(() => {
    const controller = getViewer();
    if (!controller || !markers.length) return;
    let frame = 0;
    const project = () => {
      const positions = controller.projectWorldPoints(
        markers.map((marker) => marker.position),
      );
      markers.forEach((marker, index) => {
        const element = elements.current.get(marker.topicGuid);
        if (!element) return;
        const point = positions[index];
        element.hidden = !point;
        if (point) {
          element.style.left = `${point.x}px`;
          element.style.top = `${point.y}px`;
        }
      });
      frame = requestAnimationFrame(project);
    };
    frame = requestAnimationFrame(project);
    return () => cancelAnimationFrame(frame);
  }, [markers, getViewer]);
  return (
    <div className={styles.overlay} aria-label="Repères des remarques">
      {markers.map((marker) => (
        <Button
          key={marker.topicGuid}
          ref={(element) => {
            if (element) elements.current.set(marker.topicGuid, element);
            else elements.current.delete(marker.topicGuid);
          }}
          className={`${styles.marker} ${activeId === marker.topicGuid ? styles.active : ""}`}
          priority="primary"
          title={`Remarque ${marker.index} : ${marker.title}`}
          nativeButtonProps={{
            "aria-label": `Remarque ${marker.index} : ${marker.title}`,
          }}
          onClick={() => onSelect(marker.topicGuid)}
        >
          {marker.index}
        </Button>
      ))}
    </div>
  );
}
