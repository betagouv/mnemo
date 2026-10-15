"use client";

import type { AssetSummary } from "@mnemo/contracts/assets";
import { useState } from "react";

import { AssetCard } from "@/entities/asset";
import { DeleteAssetButton } from "@/features/delete-asset";
import { UploadAssetControls } from "@/features/upload-asset";

import styles from "./project-assets.module.css";

export function ProjectAssets({
  projectId,
  initialAssets,
}: {
  projectId: string;
  initialAssets: AssetSummary[];
}) {
  const [assets, setAssets] = useState(initialAssets);

  function updateAsset(uploaded: AssetSummary) {
    setAssets((current) => [
      uploaded,
      ...current.filter((asset) => asset.id !== uploaded.id),
    ]);
  }

  return (
    <section className={styles.files} aria-labelledby="project-files-title">

      <UploadAssetControls onUploaded={updateAsset} projectId={projectId} />

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="project-files-title">Fichiers</h2>
        <span className={styles.fileCount} aria-live="polite">
          {assets.length} {assets.length > 1 ? "fichiers" : "fichier"}
        </span>
      </div>

      {assets.length > 0 ? (
        <div className={styles.assetList}>
          {assets.map((asset) => (
            <AssetCard
              action={
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
