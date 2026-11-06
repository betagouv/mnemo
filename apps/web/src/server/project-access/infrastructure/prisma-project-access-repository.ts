import type {
  CreateProjectRoleInput,
  SetMemberAccessInput,
  UpdateProjectRoleInput,
} from "@mnemo/contracts/project-access";
import { Prisma, type MnemoPrismaDatabase } from "@mnemo/database";
import { isProjectPermission } from "@mnemo/domain/project";

import { ProjectAccessDeniedError } from "../application/project-access-service";
import type { ProjectAccessOverview } from "@mnemo/contracts/project-access";
import type { ProjectAccessRepository } from "../application/project-access-repository";
import { requireOwner, requireProjectRoles } from "./project-access-guards";

async function replaceGrants(
  tx: Prisma.TransactionClient,
  projectId: string,
  userId: string,
  roleIds: string[],
  permissions: string[],
) {
  await tx.project_member_roles.deleteMany({
    where: { project_id: projectId, user_id: userId },
  });
  await tx.project_member_permissions.deleteMany({
    where: { project_id: projectId, user_id: userId },
  });
  await tx.project_member_roles.createMany({
    data: [...new Set(roleIds)].map((roleId) => ({
      project_id: projectId,
      user_id: userId,
      role_id: roleId,
    })),
  });
  await tx.project_member_permissions.createMany({
    data: [...new Set(permissions)].map((permission) => ({
      project_id: projectId,
      user_id: userId,
      permission,
    })),
  });
}

export class PrismaProjectAccessRepository implements ProjectAccessRepository {
  constructor(private readonly db: MnemoPrismaDatabase) {}

  async list(projectId: string): Promise<ProjectAccessOverview> {
    const [roles, members, invitations] = await Promise.all([
      this.db.project_roles.findMany({
        where: { project_id: projectId },
        include: { permissions: true },
        orderBy: { name: "asc" },
      }),
      this.db.project_members.findMany({
        where: { project_id: projectId },
        include: { users: true, permissions: true, custom_roles: true },
        orderBy: { joined_at: "asc" },
      }),
      this.db.project_invitations.findMany({
        where: { project_id: projectId, expires_at: { gt: new Date() } },
        orderBy: { created_at: "desc" },
      }),
    ]);
    return {
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        permissions: role.permissions
          .map((grant) => grant.permission)
          .filter(isProjectPermission),
      })),
      members: members.map((member) => ({
        userId: member.user_id,
        name: member.users.display_name,
        email: member.users.email,
        baseRole: member.role,
        roleIds: member.custom_roles.map((grant) => grant.role_id),
        permissions: member.permissions
          .map((grant) => grant.permission)
          .filter(isProjectPermission),
      })),
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        baseRole: invitation.base_role,
        roleIds: invitation.role_ids,
        permissions: invitation.permissions.filter(isProjectPermission),
        expiresAt: invitation.expires_at,
      })),
    };
  }

  async createRole(actorId: string, input: CreateProjectRoleInput) {
    await this.db.$transaction(async (tx) => {
      await requireOwner(tx, input.projectId, actorId);
      await tx.project_roles.create({
        data: {
          project_id: input.projectId,
          name: input.name,
          permissions: {
            create: [...new Set(input.permissions)].map((permission) => ({
              permission,
            })),
          },
        },
      });
    });
  }

  async updateRole(actorId: string, input: UpdateProjectRoleInput) {
    await this.db.$transaction(async (tx) => {
      await requireOwner(tx, input.projectId, actorId);
      const role = await tx.project_roles.findFirst({
        where: { id: input.roleId, project_id: input.projectId },
      });
      if (!role) throw new ProjectAccessDeniedError();
      await tx.project_roles.update({
        where: { id: role.id },
        data: { name: input.name },
      });
      await tx.project_role_permissions.deleteMany({
        where: { role_id: role.id },
      });
      await tx.project_role_permissions.createMany({
        data: [...new Set(input.permissions)].map((permission) => ({
          role_id: role.id,
          permission,
        })),
      });
    });
  }

  async deleteRole(actorId: string, projectId: string, roleId: string) {
    await this.db.$transaction(async (tx) => {
      await requireOwner(tx, projectId, actorId);
      const result = await tx.project_roles.deleteMany({
        where: { id: roleId, project_id: projectId },
      });
      if (!result.count) throw new ProjectAccessDeniedError();
    });
  }

  async setMember(actorId: string, input: SetMemberAccessInput) {
    await this.db.$transaction(async (tx) => {
      await requireOwner(tx, input.projectId, actorId);
      await requireProjectRoles(tx, input.projectId, input.roleIds);
      const result = await tx.project_members.updateMany({
        where: {
          project_id: input.projectId,
          user_id: input.userId,
          role: { not: "owner" },
        },
        data: { role: input.baseRole },
      });
      if (!result.count) throw new ProjectAccessDeniedError();
      await replaceGrants(
        tx,
        input.projectId,
        input.userId,
        input.roleIds,
        input.permissions,
      );
    });
  }

  async removeMember(actorId: string, projectId: string, userId: string) {
    await this.db.$transaction(async (tx) => {
      await requireOwner(tx, projectId, actorId);
      const result = await tx.project_members.deleteMany({
        where: {
          project_id: projectId,
          user_id: userId,
          role: { not: "owner" },
        },
      });
      if (!result.count) throw new ProjectAccessDeniedError();
    });
  }
}
