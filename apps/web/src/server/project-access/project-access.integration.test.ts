import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { getProjectService } from "@/server/projects/project-service-factory";

import { ProjectAccessDeniedError } from "./application/project-access-service";
import { getProjectAccessService } from "./project-access-service-factory";

const nonce = randomUUID();
const emailOwner = `owner-${nonce}@example.invalid`;
const emailGuest = `guest-${nonce}@example.invalid`;
const emailUnverified = `unverified-${nonce}@example.invalid`;
let projectId: string | undefined;

afterAll(async () => {
  const database = getRuntimePrismaDatabase();
  if (projectId)
    await database.projects.deleteMany({ where: { id: projectId } });
  await database.users.deleteMany({
    where: { email: { in: [emailOwner, emailGuest, emailUnverified] } },
  });
});

describe("project access persistence", () => {
  it("grants cumulative permissions to an existing account", async () => {
    const database = getRuntimePrismaDatabase();
    const [owner, guest] = await Promise.all([
      database.users.create({
        data: { email: emailOwner, display_name: "Owner" },
      }),
      database.users.create({
        data: {
          email: emailGuest,
          display_name: "Guest",
          email_verified: true,
        },
      }),
    ]);
    const project = await getProjectService().create(owner.id, {
      title: "Access test",
    });
    projectId = project.id;
    const access = getProjectAccessService();

    await database.users.create({
      data: { email: emailUnverified, display_name: "Unverified" },
    });
    await expect(
      access.addMember(owner.id, {
        projectId: project.id,
        email: emailUnverified,
        baseRole: "viewer",
        roleIds: [],
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(ProjectAccessDeniedError);

    await access.createRole(owner.id, {
      projectId: project.id,
      name: "Commentateur",
      permissions: ["bcf:comment:create"],
    });
    const overview = await access.list(owner.id, project.id);
    const role = overview.roles[0];
    expect(role?.permissions).toEqual(["bcf:comment:create"]);

    await access.addMember(owner.id, {
      projectId: project.id,
      email: emailGuest,
      baseRole: "viewer",
      roleIds: role ? [role.id] : [],
      permissions: ["asset:create"],
    });
    await expect(
      access.addMember(owner.id, {
        projectId: project.id,
        email: emailGuest,
        baseRole: "viewer",
        roleIds: [],
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(ProjectAccessDeniedError);

    const guestProject = await getProjectService().find(guest.id, project.id);
    expect(guestProject).toMatchObject({
      role: "viewer",
      permissions: expect.arrayContaining([
        "asset:create",
        "bcf:comment:create",
      ]),
    });
    await expect(access.list(guest.id, project.id)).rejects.toBeInstanceOf(
      ProjectAccessDeniedError,
    );

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
    expect(await getProjectService().find(guest.id, project.id)).toBeNull();
  });
});
