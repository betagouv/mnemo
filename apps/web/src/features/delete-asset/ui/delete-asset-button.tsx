"use client";

import { useState } from "react";

import { deleteAsset as deleteAssetAction } from "@/server/assets/actions";

import styles from "./delete-button.module.css";

export function DeleteAssetButton({
  assetId,
  assetName,
  onDeleted,
  projectId,
}: {
  assetId: string;
  assetName: string;
  onDeleted: (assetId: string) => void;
  projectId: string;
}) {
  const [pending, setPending] = useState(false);

  async function deleteAsset() {
    if (!window.confirm(`Supprimer « ${assetName} » et toutes ses données ?`)) {
      return;
    }

    setPending(true);
    try {
      await deleteAssetAction({ assetId, projectId });
      onDeleted(assetId);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      aria-label={`Supprimer ${assetName}`}
      className={styles.button}
      disabled={pending}
      onClick={() => void deleteAsset()}
      title="Supprimer le fichier"
      type="button"
    >
      <span className="fr-icon-delete-line" aria-hidden="true" />
    </button>
  );
}
