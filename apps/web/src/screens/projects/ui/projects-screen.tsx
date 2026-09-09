import type { ProjectSummary } from "@mnemo/contracts/projects";

import { getServerCaller } from "@/server/trpc/server-caller";

import { ProjectsWorkspace } from "./projects-workspace";

export async function ProjectsScreen() {
  const caller = await getServerCaller();
  const projects = await caller.projects.list();

  return <ProjectsWorkspace initialProjects={projects} />;
}

export type ProjectsWorkspaceProps = {
  initialProjects: ProjectSummary[];
};
