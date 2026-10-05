import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaDatabase } from "./prisma-client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("DATABASE_URL is required for database integration tests");

const database = createPrismaDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const ownerId = randomUUID();
const editorId = randomUUID();
const projectId = randomUUID();

describe("project membership persistence", () => {
  beforeAll(async () => {
    await database.db.users.createMany({
      data: [
        {
          id: ownerId,
          email: `${ownerId}@test.mnemo.local`,
          display_name: "Owner",
        },
        {
          id: editorId,
          email: `${editorId}@test.mnemo.local`,
          display_name: "Editor",
        },
      ],
    });
    await database.db.projects.create({
      data: {
        id: projectId,
        name: "Integration test project",
        created_by: ownerId,
        project_members: {
          create: [
            { user_id: ownerId, role: "owner" },
            { user_id: editorId, role: "editor" },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await database.db.projects.deleteMany({ where: { id: projectId } });
    await database.db.users.deleteMany({
      where: { id: { in: [ownerId, editorId] } },
    });
    await database.close();
  });

  it("finds a shared project through the membership table", async () => {
    const rows = await database.db.project_members.findMany({
      where: { user_id: editorId },
      include: { projects: true },
    });
    expect(
      rows.map((row) => ({
        projectId: row.projects.id,
        projectName: row.projects.name,
        role: row.role,
      })),
    ).toEqual([
      { projectId, projectName: "Integration test project", role: "editor" },
    ]);
  });
});
