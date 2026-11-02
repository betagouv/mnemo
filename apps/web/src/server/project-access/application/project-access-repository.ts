import type {
  AddMemberInput,
  CreateProjectRoleInput,
  SetMemberAccessInput,
  UpdateProjectRoleInput,
} from "@mnemo/contracts/project-access";
import type { ProjectPermission, ProjectRole } from "@mnemo/domain/project";

export type CustomProjectRole = {
  id: string;
  name: string;
  permissions: ProjectPermission[];
};

export type ProjectMemberAccess = {
  userId: string;
  name: string;
  email: string;
  baseRole: ProjectRole;
  roleIds: string[];
  permissions: ProjectPermission[];
};

export type ProjectAccessOverview = {
  roles: CustomProjectRole[];
  members: ProjectMemberAccess[];
};

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
  addMember(actorId: string, input: AddMemberInput): Promise<void>;
}
