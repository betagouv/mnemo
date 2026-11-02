import type {
  CreateProjectRoleInput,
  SetMemberAccessInput,
  UpdateProjectRoleInput,
} from "@mnemo/contracts/project-access";

import type { ProjectRepository } from "@/server/projects/application/project-repository";

import type { ProjectAccessRepository } from "./project-access-repository";

export class ProjectAccessDeniedError extends Error {}

export class ProjectAccessService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly access: ProjectAccessRepository,
  ) {}

  private async requireOwner(actorId: string, projectId: string) {
    const project = await this.projects.findForActor(actorId, projectId);
    if (project?.role !== "owner") {
      throw new ProjectAccessDeniedError("Project owner access required");
    }
  }

  async list(actorId: string, projectId: string) {
    await this.requireOwner(actorId, projectId);
    return this.access.list(projectId);
  }

  async createRole(actorId: string, input: CreateProjectRoleInput) {
    await this.requireOwner(actorId, input.projectId);
    return this.access.createRole(actorId, input);
  }

  async updateRole(actorId: string, input: UpdateProjectRoleInput) {
    await this.requireOwner(actorId, input.projectId);
    return this.access.updateRole(actorId, input);
  }

  async deleteRole(actorId: string, projectId: string, roleId: string) {
    await this.requireOwner(actorId, projectId);
    return this.access.deleteRole(actorId, projectId, roleId);
  }

  async setMember(actorId: string, input: SetMemberAccessInput) {
    await this.requireOwner(actorId, input.projectId);
    return this.access.setMember(actorId, input);
  }

  async removeMember(actorId: string, projectId: string, userId: string) {
    await this.requireOwner(actorId, projectId);
    return this.access.removeMember(actorId, projectId, userId);
  }
}
