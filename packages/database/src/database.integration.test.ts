import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

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
        title: "Integration test project",
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
        projectTitle: row.projects.title,
        role: row.role,
      })),
    ).toEqual([
      { projectId, projectTitle: "Integration test project", role: "editor" },
    ]);
  });

  it("stores only the COPC artifact key for point clouds", async () => {
    const columns = await database.db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'point_cloud_processing_results'
        AND column_name LIKE '%object_key'
      ORDER BY column_name
    `;
    expect(columns.map(({ column_name }) => column_name)).toEqual([
      "copc_object_key",
    ]);
  });

  it("migrates the retired plan preset without losing custom rules", async () => {
    const migration = await readFile(
      new URL(
        "../prisma/migrations/20261112113000_floor_plan_styles/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await database.db.$transaction(async (tx) => {
      // A temporary table shadows the real table for this migration check.
      await tx.$executeRaw`CREATE TEMPORARY TABLE project_floor_plans (
        id integer PRIMARY KEY, style jsonb NOT NULL, version integer NOT NULL,
        updated_at timestamptz NOT NULL
      ) ON COMMIT DROP`;
      const rules = [{ id: randomUUID(), name: "Murs", fillColor: "#808080" }];
      const style = { preset: "fire-safety", rules };
      await tx.$executeRaw`INSERT INTO project_floor_plans VALUES
        (1, ${JSON.stringify(style)}::jsonb, 3, '2026-11-01'),
        (2, '{"preset":"mep","rules":[]}'::jsonb, 2, '2026-11-01')`;
      // Execute the checked-in migration verbatim, using only its static SQL.
      await tx.$executeRawUnsafe(migration);
      const rows = await tx.$queryRaw<
        Array<{ id: number; style: unknown; version: number }>
      >`
        SELECT id, style, version FROM project_floor_plans ORDER BY id
      `;
      expect(rows).toEqual([
        { id: 1, style: { preset: "architectural", rules }, version: 4 },
        { id: 2, style: { preset: "mep", rules: [] }, version: 2 },
      ]);
      expect(await tx.$executeRawUnsafe(migration)).toBe(0);
    });
  });
});
