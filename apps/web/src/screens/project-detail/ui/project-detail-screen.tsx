import { projectIdSchema } from "@mnemo/contracts/projects";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAssetService } from "@/server/assets/asset-service-factory";
import { resolveActor } from "@/server/auth/resolve-actor";
import { getProjectService } from "@/server/projects/project-service-factory";
import { DeleteProjectButton } from "@/features/delete-project";
import { ProjectAssets } from "@/widgets/project-assets";

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

  const actorId = resolveActor().id;
  const project = await getProjectService().find(actorId, parsedProjectId.data);

  if (!project) {
    notFound();
  }

  const assets = await getAssetService().list(actorId, project.id);

  return (
    <div className={`fr-container ${styles.page}`}>
      <Link className={styles.back} href="/projets">
        <span className="fr-icon-arrow-left-line" aria-hidden="true" />
        Tous les dossiers
      </Link>

      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>PROJET · {roleLabels[project.role]}</p>
          <h1>{project.title}</h1>
          <p>
            {[project.address, project.description]
              .filter(Boolean)
              .join(" · ") ||
              "Cet espace est prêt à recevoir ses premières données."}
          </p>
        </div>
        <div className={styles.headingActions}>
          <div className={styles.status}>
            <span aria-hidden="true" />
            Espace actif
          </div>
          {project.role === "owner" ? (
            <DeleteProjectButton
              projectId={project.id}
              projectName={project.title}
            />
          ) : null}
        </div>
      </header>

      <ProjectAssets initialAssets={assets} projectId={project.id} />
    </div>
  );
}
