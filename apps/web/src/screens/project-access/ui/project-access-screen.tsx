import { projectIdSchema } from "@mnemo/contracts/projects";
import Link from "next/link";
import { notFound } from "next/navigation";

import { resolvePageActor } from "@/server/auth/resolve-actor";
import { ProjectAccessDeniedError } from "@/server/project-access/application/project-access-service";
import { getProjectAccessService } from "@/server/project-access/project-access-service-factory";
import { getProjectService } from "@/server/projects/project-service-factory";

import { ProjectAccessManager } from "./project-access-manager";

export async function ProjectAccessScreen({
  projectId,
}: {
  projectId: string;
}) {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) notFound();
  const actorId = (await resolvePageActor()).id;
  const project = await getProjectService().find(actorId, parsed.data);
  if (!project) notFound();

  let overview;
  try {
    overview = await getProjectAccessService().list(actorId, parsed.data);
  } catch (error) {
    if (error instanceof ProjectAccessDeniedError) notFound();
    throw error;
  }

  return (
    <div className="fr-container py-8">
      <div className="mx-auto max-w-5xl">
        <Link
          className="fr-link fr-icon-arrow-left-line fr-link--icon-left"
          href={`/projets/${project.id}`}
        >
          Retour au dossier
        </Link>
        <h1 className="mb-2 mt-6">Accès à {project.title}</h1>
        <p className="mb-8 text-[var(--text-mention-grey)]">
          Invitez des personnes et définissez leurs droits dans ce dossier.
        </p>
        <ProjectAccessManager projectId={project.id} overview={overview} />
      </div>
    </div>
  );
}
