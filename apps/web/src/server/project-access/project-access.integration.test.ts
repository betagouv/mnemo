import { createHash, randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { sendTransactionalEmail } from "@/server/email/brevo-email";
import { getProjectService } from "@/server/projects/project-service-factory";

import { ProjectAccessDeniedError } from "./application/project-access-service";
import {
  InvitationUnavailableError,
  InvitationWrongAccountError,
} from "./infrastructure/prisma-project-invitation-repository";
import { getProjectAccessService } from "./project-access-service-factory";
import { getProjectInvitationService } from "./project-invitation-service-factory";

const deliveries = vi.hoisted(() => [] as { to: string; actionUrl: string }[]);
vi.mock("@/server/email/brevo-email", () => ({
  sendTransactionalEmail: vi.fn(
    async (message: (typeof deliveries)[number]) => {
      deliveries.push(message);
    },
  ),
}));

const nonce = randomUUID();
const emailOwner = `owner-${nonce}@example.invalid`;
const emailGuest = `guest-${nonce}@example.invalid`;
const emailUnverified = `unverified-${nonce}@example.invalid`;
const emailNew = `new-${nonce}@example.invalid`;
let projectId: string | undefined;

function lastToken() {
  const token = deliveries.at(-1)?.actionUrl.split("/").at(-1);
  if (!token) throw new Error("Expected an invitation link");
  return token;
}

afterAll(async () => {
  const database = getRuntimePrismaDatabase();
  if (projectId)
    await database.projects.deleteMany({ where: { id: projectId } });
  await database.users.deleteMany({
    where: {
      email: { in: [emailOwner, emailGuest, emailUnverified, emailNew] },
    },
  });
});

describe("project invitations and access persistence", () => {
  it("grants access only after the invited verified account accepts once", async () => {
    const database = getRuntimePrismaDatabase();
    const [owner, guest, unverified] = await Promise.all([
      database.users.create({
        data: {
          email: emailOwner,
          display_name: "Owner",
          email_verified: true,
        },
      }),
      database.users.create({
        data: {
          email: emailGuest,
          display_name: "Guest",
          email_verified: true,
        },
      }),
      database.users.create({
        data: { email: emailUnverified, display_name: "Unverified" },
      }),
    ]);
    const project = await getProjectService().create(owner.id, {
      title: "Access test",
    });
    projectId = project.id;
    const access = getProjectAccessService();
    const invitations = getProjectInvitationService();

    await access.createRole(owner.id, {
      projectId: project.id,
      name: "Commentateur",
      permissions: ["bcf:comment:create"],
    });
    const role = (await access.list(owner.id, project.id)).roles[0];
    expect(role?.permissions).toEqual(["bcf:comment:create"]);

    await invitations.issue(owner.id, {
      projectId: project.id,
      email: emailGuest,
      baseRole: "viewer",
      roleIds: role ? [role.id] : [],
      permissions: ["asset:create"],
    });
    const guestToken = lastToken();
    expect(deliveries.at(-1)?.to).toBe(emailGuest);
    expect(await invitations.preview(guestToken)).toMatchObject({
      email: emailGuest,
      projectTitle: "Access test",
    });
    expect((await access.list(owner.id, project.id)).invitations).toHaveLength(
      1,
    );
    expect(await getProjectService().find(guest.id, project.id)).toBeNull();
    await expect(
      invitations.issue(guest.id, {
        projectId: project.id,
        email: emailNew,
        baseRole: "viewer",
        roleIds: [],
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(ProjectAccessDeniedError);
    const invitationId = (await access.list(owner.id, project.id))
      .invitations[0]!.id;
    expect(await invitations.listForAccount(guest.id)).toMatchObject([
      { id: invitationId, projectTitle: "Access test", baseRole: "viewer" },
    ]);
    expect(await invitations.listForAccount(owner.id)).toEqual([]);
    await expect(
      invitations.listForAccount(unverified.id),
    ).rejects.toBeInstanceOf(ProjectAccessDeniedError);
    await expect(
      invitations.revoke(guest.id, project.id, invitationId),
    ).rejects.toBeInstanceOf(ProjectAccessDeniedError);
    await expect(
      invitations.accept(owner.id, guestToken),
    ).rejects.toBeInstanceOf(InvitationWrongAccountError);
    await expect(
      invitations.acceptForAccount(owner.id, invitationId),
    ).rejects.toBeInstanceOf(InvitationWrongAccountError);
    await expect(
      invitations.acceptForAccount(guest.id, invitationId),
    ).resolves.toBe(project.id);
    await expect(
      invitations.accept(guest.id, guestToken),
    ).rejects.toBeInstanceOf(InvitationUnavailableError);
    expect(await getProjectService().find(guest.id, project.id)).toMatchObject({
      role: "viewer",
      permissions: expect.arrayContaining([
        "asset:create",
        "bcf:comment:create",
      ]),
    });
    await expect(access.list(guest.id, project.id)).rejects.toBeInstanceOf(
      ProjectAccessDeniedError,
    );
    await expect(
      invitations.issue(owner.id, {
        projectId: project.id,
        email: emailGuest,
        baseRole: "viewer",
        roleIds: [],
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(ProjectAccessDeniedError);

    await access.updateRole(owner.id, {
      projectId: project.id,
      roleId: role!.id,
      name: "Commentateur",
      permissions: ["bcf:comment:create", "bcf:topic:create"],
    });
    expect(
      (await getProjectService().find(guest.id, project.id))?.permissions,
    ).toContain("bcf:topic:create");
    await access.removeMember(owner.id, project.id, guest.id);

    await invitations.issue(owner.id, {
      projectId: project.id,
      email: emailGuest,
      baseRole: "viewer",
      roleIds: [],
      permissions: [],
    });
    const declinedToken = lastToken();
    const declinedId = (await invitations.listForAccount(guest.id))[0]!.id;
    await expect(
      invitations.declineForAccount(owner.id, declinedId),
    ).rejects.toBeInstanceOf(InvitationUnavailableError);
    await invitations.declineForAccount(guest.id, declinedId);
    expect(await invitations.preview(declinedToken)).toBeNull();

    await invitations.issue(owner.id, {
      projectId: project.id,
      email: emailUnverified,
      baseRole: "editor",
      roleIds: [],
      permissions: [],
    });
    const unverifiedToken = lastToken();
    await expect(
      invitations.accept(unverified.id, unverifiedToken),
    ).rejects.toBeInstanceOf(InvitationWrongAccountError);
    await database.users.update({
      where: { id: unverified.id },
      data: { email_verified: true },
    });
    await expect(
      invitations.accept(unverified.id, unverifiedToken),
    ).resolves.toBe(project.id);
  });

  it("supports registration after invitation and lets the owner revoke it", async () => {
    const database = getRuntimePrismaDatabase();
    const owner = await database.users.findUniqueOrThrow({
      where: { email: emailOwner },
    });
    const invitations = getProjectInvitationService();
    await invitations.issue(owner.id, {
      projectId: projectId!,
      email: emailNew,
      baseRole: "viewer",
      roleIds: [],
      permissions: [],
    });
    const firstToken = lastToken();
    await database.project_invitations.update({
      where: {
        token_hash: createHash("sha256").update(firstToken).digest("hex"),
      },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    expect(await invitations.preview(firstToken)).toBeNull();
    await expect(
      invitations.accept(owner.id, firstToken),
    ).rejects.toBeInstanceOf(InvitationUnavailableError);
    await invitations.issue(owner.id, {
      projectId: projectId!,
      email: emailNew,
      baseRole: "viewer",
      roleIds: [],
      permissions: [],
    });
    const secondToken = lastToken();
    const pending = (
      await getProjectAccessService().list(owner.id, projectId!)
    ).invitations.find((invitation) => invitation.email === emailNew);
    expect(pending).toBeDefined();
    await invitations.revoke(owner.id, projectId!, pending!.id);
    expect(await invitations.preview(secondToken)).toBeNull();

    await invitations.issue(owner.id, {
      projectId: projectId!,
      email: emailNew,
      baseRole: "viewer",
      roleIds: [],
      permissions: ["bcf:comment:create"],
    });
    const thirdToken = lastToken();
    const newcomer = await database.users.create({
      data: {
        email: emailNew,
        display_name: "New account",
        email_verified: true,
      },
    });
    await expect(invitations.accept(newcomer.id, thirdToken)).resolves.toBe(
      projectId,
    );
    expect(
      await getProjectService().find(newcomer.id, projectId!),
    ).toMatchObject({
      permissions: expect.arrayContaining(["bcf:comment:create"]),
    });
  });

  it("removes pending access when Brevo rejects the invitation", async () => {
    const database = getRuntimePrismaDatabase();
    const owner = await database.users.findUniqueOrThrow({
      where: { email: emailOwner },
    });
    const failedEmail = `failed-${nonce}@example.invalid`;
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(
      new Error("provider failure"),
    );
    await expect(
      getProjectInvitationService().issue(owner.id, {
        projectId: projectId!,
        email: failedEmail,
        baseRole: "viewer",
        roleIds: [],
        permissions: [],
      }),
    ).rejects.toThrow("Invitation email delivery failed");
    expect(
      await database.project_invitations.findFirst({
        where: { project_id: projectId, email: failedEmail },
      }),
    ).toBeNull();
  });
});
