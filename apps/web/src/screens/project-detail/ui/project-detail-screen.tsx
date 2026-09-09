import { projectIdSchema } from "@mnemo/contracts/projects";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getServerCaller } from "@/server/trpc/server-caller";

import styles from "./project-detail-screen.module.css";

const roleLabels = {
  owner: "Propriétaire",
  editor: "Éditeur",
  viewer: "Lecture",
} as const;

export async function ProjectDetailScreen({
  projectId,
}: {
  projectId: string;
}) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);

  if (!parsedProjectId.success) {
    notFound();
  }

  const caller = await getServerCaller();
  const project = await caller.projects.find({
    projectId: parsedProjectId.data,
  });

  if (!project) {
    notFound();
  }

  return (
    <div className={`fr-container ${styles.page}`}>
      <Link className={styles.back} href="/projets">
        <span className="fr-icon-arrow-left-line" aria-hidden="true" />
        Tous les projets
      </Link>

      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>PROJET · {roleLabels[project.role]}</p>
          <h1>{project.name}</h1>
          <p>
            {project.description ??
              "Cet espace est prêt à recevoir ses premières données."}
          </p>
        </div>
        <div className={styles.status}>
          <span aria-hidden="true" />
          Espace actif
        </div>
      </header>

      <div className={styles.layout}>
        <section className={styles.files} aria-labelledby="project-files-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>DONNÉES</p>
              <h2 id="project-files-title">Fichiers du projet</h2>
            </div>
            <span>0 fichier</span>
          </div>
          <div className={styles.empty}>
            <div className={styles.emptyIcon} aria-hidden="true">
              <span className="fr-icon-file-add-line" />
            </div>
            <h3>Ajoutez vos premières données</h3>
            <p>
              Les originaux IFC et point cloud seront conservés dans le stockage
              du projet, séparément de leurs caches de rendu.
            </p>
          </div>
        </section>

        <aside className={styles.summary} aria-labelledby="summary-title">
          <p className={styles.eyebrow}>SYNTHÈSE</p>
          <h2 id="summary-title">État du projet</h2>
          <dl>
            <div>
              <dt>Maquettes IFC</dt>
              <dd>0</dd>
            </div>
            <div>
              <dt>Nuages de points</dt>
              <dd>0</dd>
            </div>
            <div>
              <dt>Remarques BCF</dt>
              <dd>0</dd>
            </div>
          </dl>
          <p className={styles.hint}>
            La scène 3D s’activera dès qu’un premier modèle aura été traité.
          </p>
        </aside>
      </div>
    </div>
  );
}
