import type {
  CreateProjectInput,
  ProjectList,
  ProjectSummary,
} from "@mnemo/contracts/projects";

import type { ProjectForActor, ProjectRepository } from "./project-repository";

function toProjectSummary(project: ProjectForActor): ProjectSummary {
  return {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export class ProjectService {
  constructor(private readonly projects: ProjectRepository) {}

  async list(actorId: string): Promise<ProjectList> {
    const projects = await this.projects.listForActor(actorId);
    return projects.map(toProjectSummary);
  }

  async create(
    actorId: string,
    input: CreateProjectInput,
  ): Promise<ProjectSummary> {
    return toProjectSummary(
      await this.projects.createForActor(actorId, {
        ...input,
        description: input.description || undefined,
      }),
    );
  }
}
