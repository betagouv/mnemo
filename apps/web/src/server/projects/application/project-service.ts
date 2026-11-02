import type {
  CreateProjectInput,
  ProjectList,
  ProjectSummary,
  UpdateProjectInput,
} from "@mnemo/contracts/projects";
import { hasProjectPermission } from "@mnemo/domain/project";

import type { ProjectForActor, ProjectRepository } from "./project-repository";

function toProjectSummary(project: ProjectForActor): ProjectSummary {
  const { assetStats, ...details } = project;
  return {
    ...details,
    permissions: project.permissions ?? [],
    assetCount: assetStats?.assetCount ?? 0,
    ifcCount: assetStats?.ifcCount ?? 0,
    pointCloudCount: assetStats?.pointCloudCount ?? 0,
    processingCount: assetStats?.processingCount ?? 0,
    failedCount: assetStats?.failedCount ?? 0,
    totalSizeBytes: (assetStats?.totalSizeBytes ?? 0n).toString(),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(actorId: string): Promise<ProjectList> {
    const projects = await this.projects.listForActor(actorId);
    return projects.map(toProjectSummary);
  }

  async find(
    actorId: string,
    projectId: string,
  ): Promise<ProjectSummary | null> {
    const project = await this.projects.findForActor(actorId, projectId);
    return project ? toProjectSummary(project) : null;
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

  async update(
    actorId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectSummary | null> {
    const project = await this.projects.findForActor(actorId, input.projectId);
    if (!project || !hasProjectPermission(project, "project:update")) {
      return null;
    }

    const updated = await this.projects.updateForActor(
      actorId,
      input.projectId,
      {
        title: input.title,
        address: input.address,
        description: input.description,
      },
      this.now(),
    );
    return updated ? toProjectSummary(updated) : null;
  }

  async delete(actorId: string, projectId: string) {
    const project = await this.projects.findForActor(actorId, projectId);

    if (!project || !hasProjectPermission(project, "project:delete")) {
      return { accepted: false as const };
    }

    const assetIds = await this.projects.requestDeletion(projectId, this.now());
    return { accepted: true as const, assetIds };
  }
}
