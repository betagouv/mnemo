import { randomUUID } from "node:crypto";

import { createPrismaDatabase } from "@mnemo/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaPointCloudSettingsRepository } from "./prisma-point-cloud-settings-repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for point-cloud integration tests");
}

const database = createPrismaDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const actorId = randomUUID();
const projectId = randomUUID();
const assetId = randomUUID();

describe("PrismaPointCloudSettingsRepository", () => {
  beforeAll(async () => {
    await database.db.users.create({
      data: {
        id: actorId,
        email: `${actorId}@test.mnemo.local`,
        display_name: "Point-cloud settings actor",
      },
    });
    await database.db.projects.create({
      data: {
        id: projectId,
        title: "Point-cloud settings project",
        created_by: actorId,
        project_members: { create: { user_id: actorId, role: "owner" } },
      },
    });
    await database.db.assets.create({
      data: {
        id: assetId,
        project_id: projectId,
        kind: "point_cloud",
        original_file_name: "scan.laz",
        media_type: "application/octet-stream",
        size_bytes: 42n,
        original_object_key: `projects/${projectId}/assets/${assetId}/original.laz`,
        status: "ready",
        created_by: actorId,
        upload_expires_at: new Date("2030-01-01T00:00:00.000Z"),
      },
    });
  });

  afterAll(async () => {
    await database.db.projects.deleteMany({ where: { id: projectId } });
    await database.db.users.deleteMany({ where: { id: actorId } });
    await database.close();
  });

  it("round-trips the transform and CRS metadata", async () => {
    const repository = new PrismaPointCloudSettingsRepository(database.db);

    await expect(
      repository.findForActor(actorId, projectId, assetId),
    ).resolves.toMatchObject({ assetId, settings: null });

    await repository.save(
      actorId,
      {
        projectId,
        assetId,
        transform: {
          position: [12.5, -3, 8],
          rotationDegrees: [-90, 0, 2.5],
          scale: [1, 1, 1],
        },
        sourceCrs: "EPSG:2154",
        targetCrs: "EPSG:4978",
      },
      new Date("2026-09-09T18:30:00.000Z"),
    );

    await expect(
      repository.findForActor(actorId, projectId, assetId),
    ).resolves.toMatchObject({
      assetId,
      role: "owner",
      settings: {
        transform: {
          position: [12.5, -3, 8],
          rotationDegrees: [-90, 0, 2.5],
          scale: [1, 1, 1],
        },
        sourceCrs: "EPSG:2154",
        targetCrs: "EPSG:4978",
      },
    });
  });
});
