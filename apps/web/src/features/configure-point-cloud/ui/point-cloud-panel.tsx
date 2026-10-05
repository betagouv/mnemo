"use client";

import type {
  PointCloudSnapshot,
  PointCloudTransform,
} from "@mnemo/ifc-viewer-adapter";
import { useState } from "react";

import { updatePointCloudSettings } from "@/server/point-clouds/actions";

import styles from "./point-cloud-panel.module.css";

export type PointCloudConfiguration = {
  assetId: string;
  fileName: string;
  transform: PointCloudTransform;
  sourceCrs: string | null;
  targetCrs: string | null;
};

function replaceVectorValue(
  vector: readonly [number, number, number],
  index: number,
  value: number,
): [number, number, number] {
  const next: [number, number, number] = [...vector];
  next[index] = value;
  return next;
}

function phaseLabel(pointCloud: PointCloudSnapshot | undefined) {
  if (!pointCloud) return "En attente";
  if (pointCloud.phase === "downloading") return "Téléchargement";
  if (pointCloud.phase === "streaming") {
    return pointCloud.source === "octree"
      ? "Chargement LOD"
      : "Décodage progressif";
  }
  if (pointCloud.phase === "ready") return "Prêt";
  return "Erreur";
}

export function PointCloudPanel({
  configurations,
  maxPoints,
  onConfigurationChange,
  onPointSizeChange,
  onReload,
  pointClouds,
  pointSize,
  projectId,
}: {
  configurations: PointCloudConfiguration[];
  maxPoints: number;
  onConfigurationChange: (configuration: PointCloudConfiguration) => void;
  onPointSizeChange: (pointSize: number) => void;
  onReload: (maxPoints: number) => void;
  pointClouds: PointCloudSnapshot[];
  pointSize: number;
  projectId: string;
}) {
  const [budgetDraft, setBudgetDraft] = useState(maxPoints);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<Record<string, string>>({});

  function updateTransform(
    configuration: PointCloudConfiguration,
    field: keyof PointCloudTransform,
    index: number,
    value: number,
  ) {
    if (!Number.isFinite(value)) return;
    onConfigurationChange({
      ...configuration,
      transform: {
        ...configuration.transform,
        [field]: replaceVectorValue(
          configuration.transform[field],
          index,
          value,
        ),
      },
    });
  }

  async function save(configuration: PointCloudConfiguration) {
    setSavingId(configuration.assetId);
    setSaveMessage((current) => ({ ...current, [configuration.assetId]: "" }));
    try {
      await updatePointCloudSettings({
        projectId,
        assetId: configuration.assetId,
        transform: configuration.transform,
        sourceCrs: configuration.sourceCrs,
        targetCrs: configuration.targetCrs,
      });
      setSaveMessage((current) => ({
        ...current,
        [configuration.assetId]: "Alignement sauvegardé",
      }));
    } catch {
      setSaveMessage((current) => ({
        ...current,
        [configuration.assetId]: "Sauvegarde impossible",
      }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <details className={styles.panel}>
      <summary>
        <span className="fr-icon-focus-3-line" aria-hidden="true" />
        Nuages de points
        <strong>{configurations.length}</strong>
      </summary>

      <div className={styles.body}>
        <section className={styles.rendering}>
          <h2>Rendu</h2>
          <label>
            <span>Taille des points</span>
            <strong>{pointSize.toLocaleString("fr-FR")}</strong>
            <input
              max="8"
              min="1"
              onChange={(event) =>
                onPointSizeChange(Number(event.target.value))
              }
              step="0.25"
              type="range"
              value={pointSize}
            />
          </label>
          <label>
            <span>Budget de points</span>
            <strong>
              {(budgetDraft / 1_000_000).toLocaleString("fr-FR")} M
            </strong>
            <input
              max="10000000"
              min="250000"
              onChange={(event) => setBudgetDraft(Number(event.target.value))}
              step="250000"
              type="range"
              value={budgetDraft}
            />
          </label>
          <button
            disabled={budgetDraft === maxPoints}
            onClick={() => onReload(budgetDraft)}
            type="button"
          >
            Appliquer le budget
          </button>
          <p>
            Pour un octree, le budget ajuste le LOD selon la caméra sans
            recharger tout le fichier. La taille et l’alignement sont appliqués
            immédiatement sur le GPU.
          </p>
        </section>

        {configurations.map((configuration) => {
          const pointCloud = pointClouds.find(
            (item) => item.assetId === configuration.assetId,
          );
          const vectorFields = [
            ["position", "Position", 0.1],
            ["rotationDegrees", "Rotation °", 1],
            ["scale", "Échelle", 0.01],
          ] as const;

          return (
            <section className={styles.cloud} key={configuration.assetId}>
              <header>
                <div>
                  <h2 title={configuration.fileName}>
                    {configuration.fileName}
                  </h2>
                  <span data-phase={pointCloud?.phase}>
                    {phaseLabel(pointCloud)}
                  </span>
                </div>
                {pointCloud?.pointCount ? (
                  <strong>
                    {pointCloud.pointCount.toLocaleString("fr-FR")} pts
                  </strong>
                ) : null}
              </header>

              {pointCloud?.source === "octree" ? (
                <p>
                  Octree LOD · {pointCloud.residentNodeCount} nœud
                  {pointCloud.residentNodeCount > 1 ? "s" : ""} résident
                  {pointCloud.residentNodeCount > 1 ? "s" : ""}
                </p>
              ) : null}

              {pointCloud && pointCloud.phase !== "ready" ? (
                <progress max={1} value={pointCloud.progress} />
              ) : null}
              {pointCloud?.sampleStride && pointCloud.sampleStride > 1 ? (
                <p>Échantillonnage 1 point sur {pointCloud.sampleStride}</p>
              ) : null}
              {pointCloud?.message ? (
                <p className={styles.error}>{pointCloud.message}</p>
              ) : null}

              <div className={styles.axisLabels} aria-hidden="true">
                <span />
                <span>X</span>
                <span>Y</span>
                <span>Z</span>
              </div>
              {vectorFields.map(([field, label, step]) => (
                <div className={styles.vector} key={field}>
                  <label>{label}</label>
                  {configuration.transform[field].map((value, index) => (
                    <input
                      aria-label={`${label} ${["X", "Y", "Z"][index]}`}
                      key={index}
                      onChange={(event) =>
                        updateTransform(
                          configuration,
                          field,
                          index,
                          Number(event.target.value),
                        )
                      }
                      step={step}
                      type="number"
                      value={value}
                    />
                  ))}
                </div>
              ))}

              <div className={styles.crs}>
                <label>
                  CRS source
                  <input
                    onChange={(event) =>
                      onConfigurationChange({
                        ...configuration,
                        sourceCrs: event.target.value || null,
                      })
                    }
                    placeholder="ex. EPSG:2154"
                    value={configuration.sourceCrs ?? ""}
                  />
                </label>
                <label>
                  CRS cible
                  <input
                    onChange={(event) =>
                      onConfigurationChange({
                        ...configuration,
                        targetCrs: event.target.value || null,
                      })
                    }
                    placeholder="CRS de la maquette"
                    value={configuration.targetCrs ?? ""}
                  />
                </label>
              </div>

              <button
                className={styles.save}
                disabled={savingId === configuration.assetId}
                onClick={() => void save(configuration)}
                type="button"
              >
                {savingId === configuration.assetId
                  ? "Sauvegarde…"
                  : "Sauvegarder l’alignement"}
              </button>
              {saveMessage[configuration.assetId] ? (
                <p role="status">{saveMessage[configuration.assetId]}</p>
              ) : null}
            </section>
          );
        })}
      </div>
    </details>
  );
}
