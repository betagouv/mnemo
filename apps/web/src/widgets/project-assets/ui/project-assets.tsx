"use client";

import type { AssetSummary } from "@mnemo/contracts/assets";
import { useRouter } from "next/navigation";
import { useAssetProcessing } from "@/features/track-asset-processing";
import { useState } from "react";

import { AssetCard } from "@/entities/asset";
import { DeleteAssetButton } from "@/features/delete-asset";
import { UploadAssetControls } from "@/features/upload-asset";

import styles from "./project-assets.module.css";

export function ProjectAssets({
  canDelete,
  canUpload,
  projectId,
  initialAssets,
}: {
  canDelete: boolean;
  canUpload: boolean;
  projectId: string;
  initialAssets: AssetSummary[];
}) {
  const [assets, setAssets] = useState(initialAssets);
  const router = useRouter();
  const pendingIds = assets
    .filter(
      (asset) =>
        asset.kind === "point_cloud" &&
        (asset.status === "uploaded" || asset.status === "processing"),
    )
    .map((asset) => asset.id)
    .join(",");
  const processingError = useAssetProcessing(
    projectId,
    pendingIds,
    (latest, watchedIds) => {
      const watched = new Set(watchedIds);
      const byId = new Map(latest.map((asset) => [asset.id, asset]));
      const completed = assets.some((asset) => {
        if (!watched.has(asset.id)) return false;
        const current = byId.get(asset.id);
        return (
          !current || current.status === "ready" || current.status === "failed"
        );
      });
      setAssets((current) =>
        current
          .filter((asset) => !watched.has(asset.id) || byId.has(asset.id))
          .map((asset) =>
            watched.has(asset.id) ? (byId.get(asset.id) ?? asset) : asset,
          ),
      );
      if (completed) router.refresh();
    },
  );

  function updateAsset(uploaded: AssetSummary) {
    setAssets((current) => [
      uploaded,
      ...current.filter((asset) => asset.id !== uploaded.id),
    ]);
  }

  return (
    <section className={styles.files} aria-labelledby="project-files-title">
      {canUpload ? (
        <UploadAssetControls onUploaded={updateAsset} projectId={projectId} />
      ) : null}

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="project-files-title">Fichiers</h2>
        <span className={styles.fileCount} aria-live="polite">
          {assets.length} {assets.length > 1 ? "fichiers" : "fichier"}
        </span>
      </div>

      {processingError ? (
        <p role="status" className="fr-text--sm mt-3">
          {processingError}
        </p>
      ) : null}
      {assets.length > 0 ? (
        <div className={styles.assetList}>
          {assets.map((asset) => (
            <AssetCard
              action={
                canDelete ? (
                  <DeleteAssetButton
                    assetId={asset.id}
                    assetName={asset.originalFileName}
                    onDeleted={(assetId) =>
                      setAssets((current) =>
                        current.filter((item) => item.id !== assetId),
                      )
                    }
                    projectId={projectId}
                  />
                ) : undefined
              }
              asset={asset}
              key={asset.id}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
