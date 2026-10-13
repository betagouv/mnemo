import { randomUUID } from "node:crypto";

import { createPrismaDatabase } from "@mnemo/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaAssetRepository } from "./prisma-asset-repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("DATABASE_URL is required for asset integration tests");

const database = createPrismaDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const actorId = randomUUID();
const projectId = randomUUID();
const assetId = randomUUID();

describe("PrismaAssetRepository", () => {
  beforeAll(async () => {
    await database.db.users.create({
      data: {
        id: actorId,
        email: `${actorId}@test.mnemo.local`,
        display_name: "Asset repository actor",
      },
    });
    await database.db.projects.create({
      data: {
        id: projectId,
        title: "Asset repository project",
        created_by: actorId,
        project_members: { create: { user_id: actorId, role: "owner" } },
      },
    });
  });

  afterAll(async () => {
    await database.db.deletion_jobs.deleteMany({
      where: { resource_id: assetId },
    });
    await database.db.projects.deleteMany({ where: { id: projectId } });
    await database.db.users.deleteMany({ where: { id: actorId } });
    await database.close();
  });

  it("persists, scopes, completes and schedules deletion of an original", async () => {
    const repository = new PrismaAssetRepository(database.db);
    const objectKey = `projects/${projectId}/assets/${assetId}/original.ifc`;
    const pending = await repository.createPending({
      id: assetId,
      projectId,
      kind: "ifc",
      originalFileName: "model.ifc",
      mediaType: "application/x-step",
      sizeBytes: 42,
      originalObjectKey: objectKey,
      uploadExpiresAt: new Date(Date.now() + 60_000),
      createdBy: actorId,
    });
    expect(pending.status).toBe("upload_pending");
    await expect(repository.listForActor(actorId, projectId)).resolves.toEqual([
      pending,
    ]);
    await expect(
      repository.findForActor(actorId, projectId, assetId),
    ).resolves.toMatchObject({ role: "owner", asset: pending });

    const completed = await repository.completeUpload(assetId, new Date());
    expect(completed.status).toBe("ready");
    const jobs = await database.db.processing_jobs.findMany({
      where: { asset_id: assetId },
    });
    expect(jobs).toEqual([]);
    await repository.completeUpload(assetId, new Date());
    await expect(
      database.db.processing_jobs.count({ where: { asset_id: assetId } }),
    ).resolves.toBe(0);

    await repository.requestDeletion(assetId, new Date());
    await expect(repository.listForActor(actorId, projectId)).resolves.toEqual(
      [],
    );
    const deletion = await database.db.deletion_jobs.findFirst({
      where: { resource_id: assetId },
    });
    expect(deletion).toMatchObject({
      resource_id: assetId,
      type: "delete_asset",
      object_keys: [objectKey],
    });
  });
});
