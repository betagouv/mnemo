"use client";

import type { AssetKind, AssetSummary } from "@mnemo/contracts/assets";
import { useState } from "react";

import { beginAssetUpload, completeAssetUpload } from "@/server/assets/actions";

import styles from "./upload-asset-controls.module.css";
import { uploadFile } from "./upload-file";

const acceptedFiles = {
  ifc: ".ifc,.ifczip",
  point_cloud: ".las,.laz,.ply,.e57",
} as const;

export function UploadAssetControls({
  projectId,
  onUploaded,
}: {
  projectId: string;
  onUploaded: (asset: AssetSummary) => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isUploading = progress !== null;

  async function startUpload(kind: AssetKind, file: File) {
    setError(null);
    setCurrentFile(file.name);
    setProgress(0);

    try {
      const target = await beginAssetUpload({
        projectId,
        kind,
        fileName: file.name,
        mediaType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      await uploadFile({
        file,
        url: target.uploadUrl,
        headers: target.requiredHeaders,
        onProgress: setProgress,
      });
      const asset = await completeAssetUpload({
        projectId,
        assetId: target.asset.id,
      });
      onUploaded(asset);
    } catch {
      setError(
        "L’envoi n’a pas abouti. Vérifiez le format, la taille et la connexion au stockage.",
      );
    } finally {
      setCurrentFile(null);
      setProgress(null);
    }
  }

  function onFileSelected(kind: AssetKind, file: File | undefined) {
    if (file) {
      void startUpload(kind, file);
    }
  }

  return (
    <div className={styles.controls}>
      <label className={styles.button} aria-disabled={isUploading}>
        <span className="fr-icon-add-line" aria-hidden="true" />
        Ajouter un IFC
        <input
          accept={acceptedFiles.ifc}
          disabled={isUploading}
          onChange={(event) => {
            onFileSelected("ifc", event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
          type="file"
        />
      </label>
      <label className={styles.secondaryButton} aria-disabled={isUploading}>
        <span className="fr-icon-focus-3-line" aria-hidden="true" />
        Ajouter un nuage
        <input
          accept={acceptedFiles.point_cloud}
          disabled={isUploading}
          onChange={(event) => {
            onFileSelected("point_cloud", event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
          type="file"
        />
      </label>

      {progress !== null ? (
        <div className={styles.progress} role="status">
          <div>
            <span>{currentFile}</span>
            <strong>{progress} %</strong>
          </div>
          <progress max={100} value={progress} />
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
