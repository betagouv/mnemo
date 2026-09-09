import Link from "next/link";

import styles from "./open-ifc-viewer-link.module.css";

export function OpenIfcViewerLink({
  assetId,
  projectId,
}: {
  assetId: string;
  projectId: string;
}) {
  return (
    <Link
      className={styles.link}
      href={`/projets/${projectId}/viewer/${assetId}`}
    >
      Ouvrir
      <span className="fr-icon-arrow-right-line" aria-hidden="true" />
    </Link>
  );
}
