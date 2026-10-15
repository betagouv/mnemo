"use client";

import Button from "@codegouvfr/react-dsfr/Button";
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
    <Button
      className={styles.button}
      disabled={pending}
      iconId="fr-icon-delete-line"
      onClick={() => void deleteAsset()}
      priority="tertiary"
      size="small"
      title={`Supprimer ${assetName}`}
    />
  );
}
