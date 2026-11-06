"use client";

import type {
  ViewerIfcSource,
  ViewerPointCloudFailure,
} from "@/entities/viewer";
import styles from "./ifc-viewer.module.css";
import type { IfcViewerSnapshot } from "@mnemo/ifc-viewer-adapter";
const phaseLabels = {
  idle: "En attente",
  initializing: "Préparation de la vue 3D",
  downloading: "Téléchargement de l’IFC",
  processing: "Construction de la scène",
  ready: "Projet prêt",
  error: "Chargement impossible",
  device_lost: "Affichage 3D interrompu",
} as const;
export function ViewerLoadStatus({
  snapshot,
  accessError,
  pointCloudFailures,
  failedSource,
  retrying,
  onRetry,
}: {
  snapshot: IfcViewerSnapshot;
  accessError: string | null;
  pointCloudFailures: ViewerPointCloudFailure[];
  failedSource: ViewerIfcSource | undefined;
  retrying: boolean;
  onRetry: (source: ViewerIfcSource) => Promise<void>;
}) {
  const isBusy =
    snapshot.phase === "initializing" ||
    snapshot.phase === "downloading" ||
    snapshot.phase === "processing";
  const hasFailed =
    snapshot.phase === "error" || snapshot.phase === "device_lost";
  return (
    <>
      {" "}
      {isBusy ? (
        <div className={styles.loadCard} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <strong>{phaseLabels[snapshot.phase]}</strong>
            <p>
              {snapshot.phase === "processing"
                ? `${snapshot.meshCount.toLocaleString("fr-FR")} maillages reçus`
                : "Préparation de la maquette…"}
            </p>
            {snapshot.parserPercent !== null ? (
              <progress max={100} value={snapshot.parserPercent} />
            ) : null}
          </div>
        </div>
      ) : null}
      {hasFailed || accessError || pointCloudFailures.length ? (
        <div className={styles.errorCard} role="alert">
          <span className="fr-icon-error-warning-fill" aria-hidden="true" />
          <div>
            <strong>
              {snapshot.phase === "ready"
                ? "Chargement partiel"
                : phaseLabels[snapshot.phase]}
            </strong>
            {hasFailed || accessError ? (
              <p>{accessError ?? snapshot.message}</p>
            ) : null}
            {pointCloudFailures.length ? (
              <p>
                Nuage indisponible :{" "}
                {pointCloudFailures
                  .map((failure) => failure.fileName)
                  .join(", ")}
                . Les autres couches restent disponibles.
              </p>
            ) : null}
            {failedSource ? (
              <button
                disabled={retrying}
                onClick={() => void onRetry(failedSource)}
                type="button"
              >
                {retrying ? "Nouvel essai…" : "Réessayer"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
