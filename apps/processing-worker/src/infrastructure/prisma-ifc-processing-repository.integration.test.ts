import { randomUUID } from "node:crypto";

import { createPrismaDatabase } from "@mnemo/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaIfcProcessingRepository } from "./prisma-ifc-processing-repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for worker integration tests");
}

const database = createPrismaDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const actorId = randomUUID();
const projectId = randomUUID();
const assetId = randomUUID();

describe("PrismaIfcProcessingRepository", () => {
  beforeAll(async () => {
    await database.db.users.create({
      data: {
        id: actorId,
        email: `${actorId}@test.mnemo.local`,
        display_name: "IFC processor actor",
      },
    });
    await database.db.projects.create({
      data: {
        id: projectId,
        title: "IFC processing project",
        created_by: actorId,
        project_members: { create: { user_id: actorId, role: "owner" } },
      },
    });
    await database.db.assets.create({
      data: {
        id: assetId,
        project_id: projectId,
        kind: "ifc",
        original_file_name: "model.ifc",
        media_type: "application/x-step",
        size_bytes: 42n,
        original_object_key: `projects/${projectId}/assets/${assetId}/original.ifc`,
        status: "uploaded",
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

  it("finds an IFC original and idempotently replaces processing metadata", async () => {
    const repository = new PrismaIfcProcessingRepository(database.db);

    await expect(repository.findIfcAsset(assetId)).resolves.toEqual({
      id: assetId,
      originalObjectKey: `projects/${projectId}/assets/${assetId}/original.ifc`,
    });

    const firstProcessing = new Date("2026-09-09T16:00:00.000Z");
    const latestProcessing = new Date("2026-09-09T16:01:00.000Z");
    const baseResult = {
      processor: "ifc-lite-server",
      processorVersion: "9.2.0",
      entityCount: 1_045,
      geometryEntityCount: 8,
      meshCount: 8,
      cacheHit: false,
    };

    await repository.saveResult(
      assetId,
      { ...baseResult, cacheKey: "first-cache" },
      firstProcessing,
    );
    await repository.saveResult(
      assetId,
      { ...baseResult, cacheKey: "latest-cache", cacheHit: true },
      latestProcessing,
    );

    await expect(
      database.db.asset_processing_results.findUnique({
        where: { asset_id: assetId },
        select: { cache_key: true, cache_hit: true, processed_at: true },
      }),
    ).resolves.toEqual({
      cache_key: "latest-cache",
      cache_hit: true,
      processed_at: latestProcessing,
    });
  });
});
