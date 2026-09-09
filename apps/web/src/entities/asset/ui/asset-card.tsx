import type { AssetSummary } from "@mnemo/contracts/assets";

import styles from "./asset-card.module.css";

const kindLabels = {
  ifc: "Maquette IFC",
  point_cloud: "Nuage de points",
} as const;

const statusLabels = {
  upload_pending: "Envoi en cours",
  uploaded: "Reçu",
  processing: "Traitement",
  ready: "Prêt",
  failed: "Échec",
} as const;

function formatBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} o`;
  if (bytes < 1_024 ** 2) return `${(bytes / 1_024).toFixed(1)} Ko`;
  if (bytes < 1_024 ** 3) return `${(bytes / 1_024 ** 2).toFixed(1)} Mo`;
  return `${(bytes / 1_024 ** 3).toFixed(2)} Go`;
}

export function AssetCard({ asset }: { asset: AssetSummary }) {
  return (
    <article className={styles.card}>
      <div className={styles.icon} aria-hidden="true">
        <span
          className={
            asset.kind === "ifc"
              ? "fr-icon-building-line"
              : "fr-icon-focus-3-line"
          }
        />
      </div>
      <div className={styles.body}>
        <p>{kindLabels[asset.kind]}</p>
        <h3 title={asset.originalFileName}>{asset.originalFileName}</h3>
        <span>{formatBytes(asset.sizeBytes)}</span>
      </div>
      <div className={`${styles.status} ${styles[asset.status]}`}>
        <span aria-hidden="true" />
        {statusLabels[asset.status]}
      </div>
    </article>
  );
}
