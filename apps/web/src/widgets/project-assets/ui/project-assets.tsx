"use client";

import type { AssetSummary } from "@mnemo/contracts/assets";
import { useState } from "react";

import { AssetCard } from "@/entities/asset";
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
  const ifcCount = assets.filter((asset) => asset.kind === "ifc").length;
  const pointCloudCount = assets.filter(
    (asset) => asset.kind === "point_cloud",
  ).length;
  const readyCount = assets.filter((asset) => asset.status === "ready").length;

  function updateAsset(uploaded: AssetSummary) {
    setAssets((current) => [
      uploaded,
      ...current.filter((asset) => asset.id !== uploaded.id),
    ]);
  }

  return (
    <div className={styles.layout}>
      <section className={styles.files} aria-labelledby="project-files-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>DONNÉES</p>
            <h2 id="project-files-title">Fichiers du projet</h2>
            <span>
              {assets.length} {assets.length > 1 ? "fichiers" : "fichier"}
            </span>
          </div>
          <UploadAssetControls onUploaded={updateAsset} projectId={projectId} />
        </div>

        {assets.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon} aria-hidden="true">
              <span className="fr-icon-file-add-line" />
            </div>
            <h3>Ajoutez vos premières données</h3>
            <p>
              Les originaux IFC et point cloud seront conservés dans le stockage
              du projet, séparément de leurs caches de rendu.
            </p>
            <small>IFC, IFCZIP · LAS, LAZ, PLY, E57 · 5 Go maximum</small>
          </div>
        ) : (
          <div className={styles.assetList}>
            {assets.map((asset) => (
              <AssetCard asset={asset} key={asset.id} />
            ))}
          </div>
        )}
      </section>

      <aside className={styles.summary} aria-labelledby="summary-title">
        <p className={styles.eyebrow}>SYNTHÈSE</p>
        <h2 id="summary-title">État du projet</h2>
        <dl>
          <div>
            <dt>Maquettes IFC</dt>
            <dd>{ifcCount}</dd>
          </div>
          <div>
            <dt>Nuages de points</dt>
            <dd>{pointCloudCount}</dd>
          </div>
          <div>
            <dt>Prêts à visualiser</dt>
            <dd>{readyCount}</dd>
          </div>
        </dl>
        <p className={styles.hint}>
          Un fichier reçu sera confié au worker de traitement lors de la
          prochaine étape.
        </p>
      </aside>
    </div>
  );
}
