import { projectIdSchema } from "@mnemo/contracts/projects";
import { hasProjectPermission } from "@mnemo/domain/project";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteProjectButton } from "@/features/delete-project";
import { ProjectMetadataModal } from "@/features/manage-project-metadata";
import { ProjectAssets } from "@/widgets/project-assets";
import { getAssetService } from "@/server/assets/asset-service-factory";
import { resolveActor } from "@/server/auth/resolve-actor";
import { getProjectService } from "@/server/projects/project-service-factory";

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
    <div className="fr-container pb-20 pt-8">
      <Link
        className={`${styles.back} mb-10 inline-flex items-center gap-[0.4rem]`}
        href="/projets"
      >
        <span className="fr-icon-arrow-left-line" aria-hidden="true" />
        Tous les dossiers
      </Link>

      <header
        className={`${styles.heading} mb-12 flex items-end justify-between gap-8 max-[577px]:items-start`}
      >
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
        <div className="flex flex-none items-center gap-3">
          <div
            className={`${styles.status} flex flex-none items-center gap-[0.55rem] px-3 py-2 max-[577px]:hidden`}
          >
            <span aria-hidden="true" />
            Espace actif
          </div>
          {hasProjectPermission(project.role, "project:update") ? (
            <ProjectMetadataModal project={project} />
          ) : null}
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
