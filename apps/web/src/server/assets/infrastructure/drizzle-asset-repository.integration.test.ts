import { randomUUID } from "node:crypto";

import {
  assets,
  createDatabase,
  deletionJobs,
  processingJobs,
  projectMembers,
  projects,
  users,
} from "@mnemo/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DrizzleAssetRepository } from "./drizzle-asset-repository";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for asset integration tests");
}

const database = createDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const actorId = randomUUID();
const projectId = randomUUID();
const assetId = randomUUID();

describe("DrizzleAssetRepository", () => {
  beforeAll(async () => {
    await database.db.insert(users).values({
      id: actorId,
      email: `${actorId}@test.mnemo.local`,
      displayName: "Asset repository actor",
    });
    await database.db.insert(projects).values({
      id: projectId,
      name: "Asset repository project",
      createdBy: actorId,
    });
    await database.db.insert(projectMembers).values({
      projectId,
      userId: actorId,
      role: "owner",
    });
  });

  afterAll(async () => {
    await database.db
      .delete(deletionJobs)
      .where(eq(deletionJobs.resourceId, assetId));
    await database.db.delete(projects).where(eq(projects.id, projectId));
    await database.db.delete(users).where(eq(users.id, actorId));
    await database.close();
  });

  it("persists, scopes and completes an original upload", async () => {
    const repository = new DrizzleAssetRepository(database.db);
    const expiresAt = new Date(Date.now() + 60_000);
    const pending = await repository.createPending({
      id: assetId,
      projectId,
      kind: "ifc",
      originalFileName: "model.ifc",
      mediaType: "application/x-step",
      sizeBytes: 42,
      originalObjectKey: `projects/${projectId}/assets/${assetId}/original.ifc`,
      uploadExpiresAt: expiresAt,
      createdBy: actorId,
    });

    expect(pending.status).toBe("upload_pending");
    await expect(repository.listForActor(actorId, projectId)).resolves.toEqual([
      pending,
    ]);
    await expect(
      repository.findForActor(actorId, projectId, assetId),
    ).resolves.toMatchObject({ role: "owner", asset: pending });

    const completed = await repository.markUploadedAndEnqueue(
      assetId,
      new Date(),
    );
    expect(completed.status).toBe("uploaded");
    await expect(
      database.db.select().from(assets).where(eq(assets.id, assetId)),
    ).resolves.toHaveLength(1);
    await expect(
      database.db
        .select()
        .from(processingJobs)
        .where(eq(processingJobs.assetId, assetId)),
    ).resolves.toMatchObject([
      {
        assetId,
        type: "process_ifc",
        status: "queued",
        attempts: 0,
      },
    ]);

    await repository.markUploadedAndEnqueue(assetId, new Date());
    await expect(
      database.db
        .select()
        .from(processingJobs)
        .where(eq(processingJobs.assetId, assetId)),
    ).resolves.toHaveLength(1);

    const deletedAt = new Date();
    await repository.requestDeletion(assetId, deletedAt);
    await expect(repository.listForActor(actorId, projectId)).resolves.toEqual(
      [],
    );
    await expect(
      database.db
        .select({
          resourceId: deletionJobs.resourceId,
          type: deletionJobs.type,
          objectKeys: deletionJobs.objectKeys,
        })
        .from(deletionJobs)
        .where(eq(deletionJobs.resourceId, assetId)),
    ).resolves.toEqual([
      {
        resourceId: assetId,
        type: "delete_asset",
        objectKeys: [`projects/${projectId}/assets/${assetId}/original.ifc`],
      },
    ]);
  });
});
