import Badge from "@codegouvfr/react-dsfr/Badge";
import type { AssetSummary } from "@mnemo/contracts/assets";
import type { ReactNode } from "react";

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
  deleting: "Suppression",
} as const;

const statusSeverities = {
  upload_pending: "info",
  uploaded: "info",
  processing: "info",
  ready: "success",
  failed: "error",
  deleting: "warning",
} as const;

function formatBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} o`;
  if (bytes < 1_024 ** 2) return `${(bytes / 1_024).toFixed(1)} Ko`;
  if (bytes < 1_024 ** 3) return `${(bytes / 1_024 ** 2).toFixed(1)} Mo`;
  return `${(bytes / 1_024 ** 3).toFixed(2)} Go`;
}

export function AssetCard({
  action,
  asset,
}: {
  action?: ReactNode;
  asset: AssetSummary;
}) {
  return (
    <article className={styles.card} data-asset-id={asset.id}>
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
      <div className={styles.side}>
        <Badge as="span" severity={statusSeverities[asset.status]}>
          {statusLabels[asset.status]}
        </Badge>
        {action}
      </div>
    </article>
  );
}
