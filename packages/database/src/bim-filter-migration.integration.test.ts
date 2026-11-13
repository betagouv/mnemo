import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createPrismaDatabase } from "./prisma-client";

it("merges model filters into projects without losing groups or confusing local level ids", async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const database = createPrismaDatabase({
    connectionString: process.env.DATABASE_URL,
  });
  const schema = `filter_migration_${randomUUID().replaceAll("-", "")}`;
  const sql = await readFile(
    new URL(
      "../prisma/migrations/20261113110000_project_bim_filters/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  try {
    await database.db.$transaction(async (tx) => {
      // The schema identifier is generated locally and contains only letters and hex digits.
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(
        `SET LOCAL search_path TO "${schema}", public`,
      );
      for (const statement of [
        "CREATE TABLE projects (id uuid PRIMARY KEY)",
        "CREATE TABLE assets (id uuid PRIMARY KEY, project_id uuid REFERENCES projects(id), kind text, status text, created_at timestamptz)",
        "CREATE TABLE model_bim_filters (asset_id uuid PRIMARY KEY REFERENCES assets(id), settings jsonb, updated_at timestamptz)",
      ])
        await tx.$executeRawUnsafe(statement);
      const projectId = randomUUID(),
        emptyProjectId = randomUUID();
      await tx.$executeRaw`INSERT INTO projects VALUES (${projectId}::uuid), (${emptyProjectId}::uuid)`;
      const groupId = randomUUID(),
        ruleId = randomUUID();
      const assetIds = [randomUUID(), randomUUID(), randomUUID()];
      for (let index = 0; index < assetIds.length; index++) {
        const assetId = assetIds[index];
        const owner = index === 2 ? emptyProjectId : projectId;
        await tx.$executeRaw`INSERT INTO assets VALUES (${assetId}::uuid, ${owner}::uuid, 'ifc', 'ready', ${new Date(index * 1000)})`;
        const settings = {
          showContext: index !== 0,
          contextOpacity: index === 0 ? 0.18 : 0.3,
          groups:
            index === 2
              ? []
              : [
                  {
                    id: groupId,
                    name: `Groupe ${index}`,
                    enabled: index === 0,
                    rules: [
                      {
                        id: ruleId,
                        enabled: true,
                        action: "isolate",
                        color: "#6a6af4",
                        query: { ifcClasses: ["IfcWall"], storeyIds: [42] },
                      },
                    ],
                  },
                ],
        };
        await tx.$executeRaw`INSERT INTO model_bim_filters VALUES (${assetId}::uuid, ${JSON.stringify(settings)}::jsonb, ${new Date(index * 1000)})`;
      }
      for (const statement of sql.split(";").filter((part) => part.trim()))
        await tx.$executeRawUnsafe(statement);
      const rows = await tx.$queryRaw<
        {
          project_id: string;
          settings: {
            groups: {
              id: string;
              enabled: boolean;
              assetIds: string[];
              rules: {
                id: string;
                query: {
                  storeys: { assetId: string; storeyId: number }[];
                  storeyIds?: unknown;
                };
              }[];
            }[];
            showContext: boolean;
            contextOpacity: number;
          };
        }[]
      >`SELECT project_id, settings FROM project_bim_filters`;
      const settings = rows.find(
        (row) => row.project_id === projectId,
      )!.settings;
      expect(settings).toMatchObject({
        showContext: true,
        contextOpacity: 0.3,
      });
      expect(settings.groups).toHaveLength(2);
      expect(settings.groups.map((group) => group.enabled)).toEqual([
        true,
        false,
      ]);
      expect(new Set(settings.groups.map((group) => group.id)).size).toBe(2);
      expect(
        new Set(
          settings.groups.flatMap((group) =>
            group.rules.map((rule) => rule.id),
          ),
        ).size,
      ).toBe(2);
      for (let index = 0; index < 2; index++) {
        const group = settings.groups[index];
        expect(group.assetIds).toEqual([assetIds[index]]);
        expect(group.rules[0].query.storeys).toEqual([
          { assetId: assetIds[index], storeyId: 42 },
        ]);
        expect(group.rules[0].query.storeyIds).toBeUndefined();
      }
      expect(
        rows.find((row) => row.project_id === emptyProjectId)?.settings.groups,
      ).toEqual([]);
      await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  } finally {
    await database.close();
  }
});
