import { projectIdSchema } from "@mnemo/contracts/projects";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getServerCaller } from "@/server/trpc/server-caller";
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

  const caller = await getServerCaller();
  const project = await caller.projects.find({
    projectId: parsedProjectId.data,
  });

  if (!project) {
    notFound();
  }

  const assets = await caller.assets.list({ projectId: project.id });

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
        <div className={styles.headingActions}>
          <div className={styles.status}>
            <span aria-hidden="true" />
            Espace actif
          </div>
          {project.role === "owner" ? (
            <DeleteProjectButton
              projectId={project.id}
              projectName={project.name}
            />
          ) : null}
        </div>
      </header>

      <ProjectAssets initialAssets={assets} projectId={project.id} />
    </div>
  );
}
