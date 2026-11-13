"use client";

import { useSyncExternalStore } from "react";
import { Stepper } from "@codegouvfr/react-dsfr/Stepper";
import type { ProcessingProgress } from "@mnemo/contracts/assets";

import { formatProgressAge } from "../model/format-progress-age";
import styles from "./asset-card.module.css";

const clockIntervalMs = 15_000;
const exactTime = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "long",
  timeZone: "UTC",
});

function subscribeToClock(onChange: () => void) {
  const timer = setInterval(onChange, clockIntervalMs);
  return () => clearInterval(timer);
}

// A stable snapshot within each interval avoids continuous external-store updates.
function getClockSnapshot() {
  return Math.floor(Date.now() / clockIntervalMs) * clockIntervalMs;
}

function getServerClockSnapshot() {
  return null;
}

const phaseLabels = {
  queued: "En attente de traitement",
  starting: "Préparation du traitement",
  downloading: "Téléchargement du fichier pour traitement",
  converting: "Conversion COPC",
  publishing: "Enregistrement du résultat",
} satisfies Record<ProcessingProgress["phase"], string>;

const phases = [
  "queued",
  "starting",
  "downloading",
  "converting",
  "publishing",
] as const;

export function AssetProcessingProgress({
  progress,
  fileName,
}: {
  progress: ProcessingProgress;
  fileName: string;
}) {
  const now = useSyncExternalStore(
    subscribeToClock,
    getClockSnapshot,
    getServerClockSnapshot,
  );
  const label = phaseLabels[progress.phase];
  const currentStep = phases.indexOf(progress.phase) + 1;
  const nextPhase = phases[currentStep];
  const updatedAt = exactTime.format(new Date(progress.updatedAt));
  return (
    <div className={styles.progress}>
      <div role="status" aria-label={`Traitement de ${fileName}`}>
        <Stepper
          classes={{
            root: styles.processingStepper,
            title: styles.processingTitle,
            state: styles.processingState,
            details: styles.processingDetails,
          }}
          currentStep={currentStep}
          stepCount={phases.length}
          title={
            <span className={styles.progressLabel}>
              <span>{label}</span>
              {progress.percent !== null ? (
                <span className={styles.progressPercent}>
                  {progress.percent} %
                </span>
              ) : null}
            </span>
          }
          nextTitle={nextPhase ? phaseLabels[nextPhase] : undefined}
        />
      </div>
      <time
        className={styles.progressUpdatedAt}
        dateTime={progress.updatedAt}
        title={`Dernière progression reçue le ${updatedAt}`}
      >
        {now === null
          ? `Mis à jour le ${updatedAt}`
          : `Mis à jour ${formatProgressAge(progress.updatedAt, now)}`}
      </time>
    </div>
  );
}
