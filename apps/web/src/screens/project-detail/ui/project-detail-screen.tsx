import Button from "@codegouvfr/react-dsfr/Button";
import { projectIdSchema } from "@mnemo/contracts/projects";
import { hasProjectPermission } from "@mnemo/domain/project";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteProjectButton } from "@/features/delete-project";
import { ProjectMetadataModal } from "@/features/manage-project-metadata";
import { ProjectAssets } from "@/widgets/project-assets";
import { getAssetService } from "@/server/assets/asset-service-factory";
import { resolvePageActor } from "@/server/auth/resolve-actor";
import { getProjectService } from "@/server/projects/project-service-factory";

import styles from "./project-detail-screen.module.css";

export async function ProjectDetailScreen({
  projectId,
}: {
  projectId: string;
}) {
  const parsedProjectId = projectIdSchema.safeParse(projectId);

  if (!parsedProjectId.success) {
    notFound();
  }

  const actorId = (await resolvePageActor()).id;
  const project = await getProjectService().find(actorId, parsedProjectId.data);

  if (!project) {
    notFound();
  }

  const assets = await getAssetService().list(actorId, project.id);
  const canOpenViewer = assets.some((asset) => asset.status === "ready");

  return (
    <div className="fr-container pb-20 pt-6">
      <Link
        className={`${styles.back} mb-5 inline-flex items-center gap-[0.4rem]`}
        href="/projets"
      >
        <span className="fr-icon-arrow-left-line" aria-hidden="true" />
        Tous les dossiers
      </Link>

      <header
        className={`${styles.heading} mb-6 flex flex-col justify-between gap-4 min-[769px]:flex-row min-[769px]:items-start`}
      >
        <div className="min-w-0">
          <h1>{project.title}</h1>
          {project.address || project.description ? (
            <p className={styles.metadata}>
              {project.address ? <span>{project.address}</span> : null}
              {project.address && project.description ? (
                <span aria-hidden="true"> · </span>
              ) : null}
              {project.description ? <span>{project.description}</span> : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canOpenViewer ? (
            <Button
              iconId="fr-icon-eye-line"
              linkProps={{ href: `/projets/${project.id}/viewer` }}
            >
              Ouvrir la vue
            </Button>
          ) : null}
          {hasProjectPermission(project, "project:update") ||
          hasProjectPermission(project, "project:delete") ? (
            <ProjectMetadataModal
              project={project}
              canEdit={hasProjectPermission(project, "project:update")}
              deleteAction={
                hasProjectPermission(project, "project:delete") ? (
                  <DeleteProjectButton
                    projectId={project.id}
                    projectName={project.title}
                  />
                ) : undefined
              }
            />
          ) : null}
          {hasProjectPermission(project, "member:manage") ? (
            <Button
              iconId="fr-icon-team-line"
              priority="secondary"
              linkProps={{ href: `/projets/${project.id}/acces` }}
            >
              Gérer les accès
            </Button>
          ) : null}
        </div>
      </header>

      <ProjectAssets
        canDelete={hasProjectPermission(project, "asset:delete")}
        canUpload={hasProjectPermission(project, "asset:create")}
        initialAssets={assets}
        projectId={project.id}
      />
    </div>
  );
}
