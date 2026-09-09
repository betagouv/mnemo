import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase } from "./client";
import { projectMembers, projects, users } from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database integration tests");
}

const database = createDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const ownerId = randomUUID();
const editorId = randomUUID();
const projectId = randomUUID();

describe("project membership persistence", () => {
  beforeAll(async () => {
    await database.db.insert(users).values([
      {
        id: ownerId,
        email: `${ownerId}@test.mnemo.local`,
        displayName: "Owner",
      },
      {
        id: editorId,
        email: `${editorId}@test.mnemo.local`,
        displayName: "Editor",
      },
    ]);
    await database.db.insert(projects).values({
      id: projectId,
      name: "Integration test project",
      createdBy: ownerId,
    });
    await database.db.insert(projectMembers).values([
      { projectId, userId: ownerId, role: "owner" },
      { projectId, userId: editorId, role: "editor" },
    ]);
  });

  afterAll(async () => {
    await database.db.delete(projects).where(eq(projects.id, projectId));
    await database.db.delete(users).where(eq(users.id, ownerId));
    await database.db.delete(users).where(eq(users.id, editorId));
    await database.close();
  });

  it("finds a shared project through the membership table", async () => {
    const rows = await database.db
      .select({
        projectId: projects.id,
        projectName: projects.name,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(eq(projectMembers.userId, editorId));

    expect(rows).toEqual([
      {
        projectId,
        projectName: "Integration test project",
        role: "editor",
      },
    ]);
  });
});
