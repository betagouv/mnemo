import type { ProjectSummary } from "@mnemo/contracts/projects";
import Link from "next/link";

import styles from "./project-card.module.css";

const roleLabels = {
  owner: "Propriétaire",
  editor: "Éditeur",
  viewer: "Lecture",
} as const;

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link
      aria-label={`Ouvrir le projet ${project.name}`}
      className={styles.link}
      href={`/projets/${project.id}`}
    >
      <article className={styles.card}>
        <div className={styles.preview} aria-hidden="true">
          <span className="fr-icon-building-line" />
        </div>
        <div className={styles.body}>
          <div className={styles.meta}>
            <span>{roleLabels[project.role]}</span>
            <time dateTime={project.updatedAt}>
              Modifié le {dateFormatter.format(new Date(project.updatedAt))}
            </time>
          </div>
          <h2>{project.name}</h2>
          <p>
            {project.description ??
              "Ajoutez une maquette IFC ou un nuage de points pour commencer."}
          </p>
          <div className={styles.footer}>
            <span>Ouvrir l’espace projet</span>
            <span className="fr-icon-arrow-right-line" aria-hidden="true" />
          </div>
        </div>
      </article>
    </Link>
  );
}
