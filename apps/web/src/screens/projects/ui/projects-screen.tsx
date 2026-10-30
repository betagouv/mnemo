import type { ProjectSummary } from "@mnemo/contracts/projects";

import { resolvePageActor } from "@/server/auth/resolve-actor";
import { getProjectService } from "@/server/projects/project-service-factory";

import { ProjectsWorkspace } from "./projects-workspace";

export async function ProjectsScreen() {
  const projects = await getProjectService().list(
    (await resolvePageActor()).id,
  );

  return <ProjectsWorkspace initialProjects={projects} />;
}

export type ProjectsWorkspaceProps = {
  initialProjects: ProjectSummary[];
};
