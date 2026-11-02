import type { IssueProjectInvitationInput } from "@mnemo/contracts/project-access";
import type { MnemoPrismaDatabase } from "@mnemo/database";
import { isAssignableProjectPermission } from "@mnemo/domain/project";

import { ProjectAccessDeniedError } from "../application/project-access-service";
import type { ProjectInvitationRepository } from "../application/project-invitation-repository";
import { requireOwner, requireProjectRoles } from "./project-access-guards";

export class InvitationUnavailableError extends Error {}
export class InvitationWrongAccountError extends Error {}

export class PrismaProjectInvitationRepository implements ProjectInvitationRepository {
  constructor(private readonly db: MnemoPrismaDatabase) {}

  async issue(
    actorId: string,
    input: IssueProjectInvitationInput,
    tokenHash: string,
    expiresAt: Date,
  ) {
    return this.db.$transaction(async (tx) => {
      await requireOwner(tx, input.projectId, actorId);
      await requireProjectRoles(tx, input.projectId, input.roleIds);
      const project = await tx.projects.findUnique({
        where: { id: input.projectId },
        select: { title: true, archived_at: true },
      });
      if (!project || project.archived_at) throw new ProjectAccessDeniedError();

      const email = input.email.trim().toLowerCase();
      const user = await tx.users.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (user) {
        const membership = await tx.project_members.findUnique({
          where: {
            project_id_user_id: {
              project_id: input.projectId,
              user_id: user.id,
            },
          },
        });
        if (membership)
          throw new ProjectAccessDeniedError("Déjà membre du dossier");
      }

      await tx.project_invitations.deleteMany({
        where: {
          project_id: input.projectId,
          email,
          expires_at: { lte: new Date() },
        },
      });
      const pending = await tx.project_invitations.findUnique({
        where: { project_id_email: { project_id: input.projectId, email } },
      });
      if (pending) throw new ProjectAccessDeniedError("Déjà invité au dossier");

      await tx.project_invitations.create({
        data: {
          project_id: input.projectId,
          email,
          token_hash: tokenHash,
          base_role: input.baseRole,
          role_ids: [...new Set(input.roleIds)],
          permissions: [...new Set(input.permissions)],
          expires_at: expiresAt,
          invited_by: actorId,
        },
      });
      return { projectTitle: project.title };
    });
  }

  async preview(tokenHash: string) {
    const invitation = await this.db.project_invitations.findUnique({
      where: { token_hash: tokenHash },
      include: { projects: true },
    });
    if (
      !invitation ||
      invitation.expires_at <= new Date() ||
      invitation.projects.archived_at
    ) {
      return null;
    }
    return {
      email: invitation.email,
      projectTitle: invitation.projects.title,
      expiresAt: invitation.expires_at,
    };
  }

  async listForAccount(actorId: string) {
    const user = await this.db.users.findUnique({
      where: { id: actorId },
      select: { email: true, email_verified: true },
    });
    if (!user?.email_verified) throw new ProjectAccessDeniedError();

    const invitations = await this.db.project_invitations.findMany({
      where: {
        email: { equals: user.email, mode: "insensitive" },
        expires_at: { gt: new Date() },
        projects: {
          archived_at: null,
          project_members: { none: { user_id: actorId } },
        },
      },
      include: {
        projects: { select: { title: true } },
        users: { select: { display_name: true } },
      },
      orderBy: { created_at: "desc" },
    });
    return invitations.map((invitation) => ({
      id: invitation.id,
      projectTitle: invitation.projects.title,
      invitedBy: invitation.users.display_name,
      baseRole:
        invitation.base_role === "editor"
          ? ("editor" as const)
          : ("viewer" as const),
      expiresAt: invitation.expires_at,
    }));
  }

  async accept(actorId: string, tokenHash: string) {
    return this.acceptMatching(actorId, { token_hash: tokenHash });
  }

  async acceptForAccount(actorId: string, invitationId: string) {
    return this.acceptMatching(actorId, { id: invitationId });
  }

  private async acceptMatching(
    actorId: string,
    where: { token_hash: string } | { id: string },
  ) {
    return this.db.$transaction(async (tx) => {
      const invitation = await tx.project_invitations.findUnique({
        where,
        include: { projects: true },
      });
      if (
        !invitation ||
        invitation.expires_at <= new Date() ||
        invitation.projects.archived_at
      ) {
        throw new InvitationUnavailableError();
      }
      const user = await tx.users.findUnique({
        where: { id: actorId },
        select: { email: true, email_verified: true },
      });
      if (
        !user?.email_verified ||
        user.email.toLowerCase() !== invitation.email
      ) {
        throw new InvitationWrongAccountError();
      }

      const consumed = await tx.project_invitations.deleteMany({
        where: {
          id: invitation.id,
          expires_at: { gt: new Date() },
        },
      });
      if (!consumed.count) throw new InvitationUnavailableError();

      const existing = await tx.project_members.findUnique({
        where: {
          project_id_user_id: {
            project_id: invitation.project_id,
            user_id: actorId,
          },
        },
      });
      if (existing) return invitation.project_id;

      const roles = await tx.project_roles.findMany({
        where: {
          project_id: invitation.project_id,
          id: { in: invitation.role_ids },
        },
        select: { id: true },
      });
      await tx.project_members.create({
        data: {
          project_id: invitation.project_id,
          user_id: actorId,
          role: invitation.base_role,
        },
      });
      await tx.project_member_roles.createMany({
        data: roles.map((role) => ({
          project_id: invitation.project_id,
          user_id: actorId,
          role_id: role.id,
        })),
      });
      await tx.project_member_permissions.createMany({
        data: invitation.permissions
          .filter(isAssignableProjectPermission)
          .map((permission) => ({
            project_id: invitation.project_id,
            user_id: actorId,
            permission,
          })),
      });
      return invitation.project_id;
    });
  }

  async declineForAccount(actorId: string, invitationId: string) {
    const user = await this.db.users.findUnique({
      where: { id: actorId },
      select: { email: true, email_verified: true },
    });
    if (!user?.email_verified) throw new ProjectAccessDeniedError();
    const deleted = await this.db.project_invitations.deleteMany({
      where: {
        id: invitationId,
        email: { equals: user.email, mode: "insensitive" },
      },
    });
    if (!deleted.count) throw new InvitationUnavailableError();
  }

  async revoke(actorId: string, projectId: string, invitationId: string) {
    await this.db.$transaction(async (tx) => {
      await requireOwner(tx, projectId, actorId);
      const deleted = await tx.project_invitations.deleteMany({
        where: { id: invitationId, project_id: projectId },
      });
      if (!deleted.count) throw new InvitationUnavailableError();
    });
  }

  async removeUndelivered(tokenHash: string) {
    await this.db.project_invitations.deleteMany({
      where: { token_hash: tokenHash },
    });
  }
}
