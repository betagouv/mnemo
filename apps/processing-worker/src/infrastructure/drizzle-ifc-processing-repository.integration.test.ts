import { randomUUID } from "node:crypto";

import {
  assetProcessingResults,
  assets,
  createDatabase,
  projectMembers,
  projects,
  users,
} from "@mnemo/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DrizzleIfcProcessingRepository } from "./drizzle-ifc-processing-repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for worker integration tests");
}

const database = createDatabase({ connectionString: databaseUrl });
const actorId = randomUUID();
const projectId = randomUUID();
const assetId = randomUUID();

describe("DrizzleIfcProcessingRepository", () => {
  beforeAll(async () => {
    await database.db.insert(users).values({
      id: actorId,
      email: `${actorId}@test.mnemo.local`,
      displayName: "IFC processor actor",
    });
    await database.db.insert(projects).values({
      id: projectId,
      name: "IFC processing project",
      createdBy: actorId,
    });
    await database.db.insert(projectMembers).values({
      projectId,
      userId: actorId,
      role: "owner",
    });
    await database.db.insert(assets).values({
      id: assetId,
      projectId,
      kind: "ifc",
      originalFileName: "model.ifc",
      mediaType: "application/x-step",
      sizeBytes: 42,
      originalObjectKey: `projects/${projectId}/assets/${assetId}/original.ifc`,
      status: "uploaded",
      createdBy: actorId,
      uploadExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
  });

  afterAll(async () => {
    await database.db.delete(projects).where(eq(projects.id, projectId));
    await database.db.delete(users).where(eq(users.id, actorId));
    await database.close();
  });

  it("finds an IFC original and idempotently replaces processing metadata", async () => {
    const repository = new DrizzleIfcProcessingRepository(database.db);

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
      database.db
        .select({
          cacheKey: assetProcessingResults.cacheKey,
          cacheHit: assetProcessingResults.cacheHit,
          processedAt: assetProcessingResults.processedAt,
        })
        .from(assetProcessingResults)
        .where(eq(assetProcessingResults.assetId, assetId)),
    ).resolves.toEqual([
      {
        cacheKey: "latest-cache",
        cacheHit: true,
        processedAt: latestProcessing,
      },
    ]);
  });
});
