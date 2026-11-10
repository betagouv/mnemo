"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import { createModal } from "@codegouvfr/react-dsfr/Modal";
import type { AssetSummary } from "@mnemo/contracts/assets";
import { useRouter } from "next/navigation";
import { useAssetProcessing } from "@/features/track-asset-processing";
import { useRef, useState } from "react";

import { AssetCard } from "@/entities/asset";
import { DeleteAssetButton } from "@/features/delete-asset";
import { UploadAssetControls } from "@/features/upload-asset";

import styles from "./project-assets.module.css";

const uploadModal = createModal({
  id: "project-asset-upload-modal",
  isOpenedByDefault: false,
});
const UploadModal = uploadModal.Component;

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
  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const isEmpty = assets.length === 0;

  function updateAsset(uploaded: AssetSummary) {
    if (!isEmpty) uploadModal.close();
    setAssets((current) => [
      uploaded,
      ...current.filter((asset) => asset.id !== uploaded.id),
    ]);
    requestAnimationFrame(() => uploadButtonRef.current?.focus());
  }

  return (
    <section className={styles.files} aria-labelledby="project-files-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className={styles.title} id="project-files-title">
            Fichiers
          </h2>
          <span className={styles.fileCount} aria-live="polite">
            {assets.length} {assets.length > 1 ? "fichiers" : "fichier"}
          </span>
        </div>
        {canUpload && !isEmpty ? (
          <Button
            priority="secondary"
            iconId="fr-icon-add-line"
            ref={uploadButtonRef}
            nativeButtonProps={{
              ...uploadModal.buttonProps,
              type: "button",
            }}
          >
            Ajouter un fichier
          </Button>
        ) : null}
      </div>

      {processingError ? (
        <p role="status" className="fr-text--sm mt-3">
          {processingError}
        </p>
      ) : null}
      {canUpload ? (
        isEmpty ? (
          <UploadAssetControls
            label="Ajoutez votre premier fichier"
            onUploaded={updateAsset}
            projectId={projectId}
          />
        ) : (
          <UploadModal
            className={styles.uploadModal}
            title="Ajouter un fichier"
            titleAs="h2"
          >
            <UploadAssetControls
              onUploaded={updateAsset}
              projectId={projectId}
            />
          </UploadModal>
        )
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
