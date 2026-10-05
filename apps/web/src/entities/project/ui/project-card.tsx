import type { ProjectSummary } from "@mnemo/contracts/projects";
import Link from "next/link";

import styles from "./project-card.module.css";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const sizeFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

function formatSize(bytesValue: string) {
  const bytes = BigInt(bytesValue);
  if (bytes >= 1_000_000_000n)
    return `${sizeFormatter.format(Number(bytes) / 1_000_000_000)} Go`;
  if (bytes >= 1_000_000n)
    return `${sizeFormatter.format(Number(bytes) / 1_000_000)} Mo`;
  if (bytes >= 1_000n)
    return `${sizeFormatter.format(Number(bytes) / 1_000)} Ko`;
  return `${bytes} o`;
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const status =
    project.failedCount > 0
      ? "Erreur de traitement"
      : project.processingCount > 0
        ? "Traitement en cours"
        : project.assetCount > 0
          ? "À jour"
          : "Vide";

  return (
    <article className={`fr-card ${styles.card}`}>
      <div className={styles.body}>
        <div className={styles.icon} aria-hidden="true">
          <span className="fr-icon-folder-2-line" />
        </div>
        <h2 className={styles.title}>
          <Link href={`/projets/${project.id}`}>{project.title}</Link>
        </h2>
        <p className={styles.address}>
          {project.address ?? "Adresse non renseignée"}
        </p>
        <div className={styles.tags}>
          {project.ifcCount > 0 && (
            <span className="fr-tag">BIM IFC · {project.ifcCount}</span>
          )}
          {project.pointCloudCount > 0 && (
            <span className="fr-tag">Scan 3D · {project.pointCloudCount}</span>
          )}
        </div>
        <p className={styles.fileCount}>
          {project.assetCount} {project.assetCount > 1 ? "fichiers" : "fichier"}{" "}
          · {formatSize(project.totalSizeBytes)}
        </p>
      </div>
      <div className={styles.footer}>
        <span
          data-status={
            project.failedCount > 0
              ? "error"
              : project.processingCount > 0
                ? "processing"
                : "ready"
          }
        >
          {status}
        </span>
        <time dateTime={project.updatedAt}>
          {dateFormatter.format(new Date(project.updatedAt))}
        </time>
      </div>
    </article>
  );
}
