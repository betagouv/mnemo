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
  it("returns only authorized current processing progress and clears it from terminal assets", async () => {
    const id = randomUUID();
    await database.db.assets.create({
      data: {
        id,
        project_id: projectId,
        kind: "point_cloud",
        status: "processing",
        original_file_name: "scan.laz",
        media_type: "application/octet-stream",
        size_bytes: 42n,
        original_object_key: `test/${id}`,
        created_by: actorId,
        upload_expires_at: new Date("2035-01-01"),
      },
    });
    const progress = {
      phase: "converting",
      percent: 42,
      updatedAt: new Date().toISOString(),
    };
    await database.db.processing_jobs.create({
      data: {
        asset_id: id,
        type: "process_point_cloud",
        status: "running",
        progress,
        locked_by: "test",
        locked_at: new Date("2035-01-01"),
      },
    });
    const repository = new PrismaAssetRepository(database.db);
    expect(
      (await repository.listForActor(actorId, projectId)).find(
        (row) => row.id === id,
      )?.processingProgress,
    ).toEqual(progress);
    expect(await repository.listForActor(randomUUID(), projectId)).toEqual([]);
    await database.db.processing_jobs.updateMany({
      where: { asset_id: id },
      data: { status: "queued", progress: undefined },
    });
    expect(
      (await repository.listForActor(actorId, projectId)).find(
        (row) => row.id === id,
      )?.processingProgress,
    ).toMatchObject({ phase: "queued", percent: null });
    await database.db.assets.update({
      where: { id },
      data: { status: "ready" },
    });
    expect(
      (await repository.listForActor(actorId, projectId)).find(
        (row) => row.id === id,
      )?.processingProgress,
    ).toBeNull();
  });
});
