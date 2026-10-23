import type { ProjectSummary } from "@mnemo/contracts/projects";

import { resolveActor } from "@/server/auth/resolve-actor";
import { getProjectService } from "@/server/projects/project-service-factory";

import { ProjectsWorkspace } from "./projects-workspace";

export async function ProjectsScreen() {
  const projects = await getProjectService().list((await resolveActor()).id);

  return <ProjectsWorkspace initialProjects={projects} />;
}

export type ProjectsWorkspaceProps = {
  initialProjects: ProjectSummary[];
};
