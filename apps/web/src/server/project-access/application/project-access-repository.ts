import type {
  CreateProjectRoleInput,
  SetMemberAccessInput,
  UpdateProjectRoleInput,
} from "@mnemo/contracts/project-access";
import type { ProjectAccessOverview } from "@mnemo/contracts/project-access";

export interface ProjectAccessRepository {
  list(projectId: string): Promise<ProjectAccessOverview>;
  createRole(actorId: string, input: CreateProjectRoleInput): Promise<void>;
  updateRole(actorId: string, input: UpdateProjectRoleInput): Promise<void>;
  deleteRole(actorId: string, projectId: string, roleId: string): Promise<void>;
  setMember(actorId: string, input: SetMemberAccessInput): Promise<void>;
  removeMember(
    actorId: string,
    projectId: string,
    userId: string,
  ): Promise<void>;
}
