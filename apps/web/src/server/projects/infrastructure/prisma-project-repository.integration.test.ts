import { randomUUID } from "node:crypto";

import { createPrismaDatabase } from "@mnemo/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaProjectRepository } from "./prisma-project-repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("DATABASE_URL is required for project integration tests");

const database = createPrismaDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const actorId = randomUUID();
const otherActorId = randomUUID();
const deletionResourceIds: string[] = [];

describe("PrismaProjectRepository", () => {
  beforeAll(async () => {
    await database.db.users.createMany({
      data: [
        {
          id: actorId,
          email: `${actorId}@test.mnemo.local`,
          display_name: "Repository test actor",
        },
        {
          id: otherActorId,
          email: `${otherActorId}@test.mnemo.local`,
          display_name: "Unrelated actor",
        },
      ],
    });
  });

  afterAll(async () => {
    await database.db.deletion_jobs.deleteMany({
      where: { resource_id: { in: deletionResourceIds } },
    });
    await database.db.projects.deleteMany({ where: { created_by: actorId } });
    await database.db.users.deleteMany({
      where: { id: { in: [actorId, otherActorId] } },
    });
    await database.close();
  });

  it("creates an owner membership and scopes listing to the actor", async () => {
    const repository = new PrismaProjectRepository(database.db);
    const created = await repository.createForActor(actorId, {
      name: "Projet dépôt",
      description: "Transaction atomique",
    });
    expect(created.role).toBe("owner");
    await expect(repository.listForActor(actorId)).resolves.toContainEqual(
      created,
    );
    await expect(repository.findForActor(actorId, created.id)).resolves.toEqual(
      created,
    );
    await expect(
      repository.findForActor(otherActorId, created.id),
    ).resolves.toBeUndefined();
  });

  it("archives a project and snapshots original and derived keys", async () => {
    const repository = new PrismaProjectRepository(database.db);
    const created = await repository.createForActor(actorId, {
      name: "Projet à supprimer",
    });
    deletionResourceIds.push(created.id);
    const assetId = randomUUID();
    const pointCloudAssetId = randomUUID();
    const topicId = randomUUID();
    const viewpointId = randomUUID();
    const objectKey = `projects/${created.id}/assets/${assetId}/original.ifc`;
    const pointCloudOriginalKey = `projects/${created.id}/assets/${pointCloudAssetId}/original.laz`;
    const pointCloudKeys = ["metadata.json", "hierarchy.bin", "octree.bin"].map(
      (name) =>
        `projects/${created.id}/assets/${pointCloudAssetId}/derived/potree-v2/${name}`,
    );
    const snapshotObjectKey = `projects/${created.id}/bcf/${topicId}/viewpoints/${viewpointId}/snapshot.png`;
    const sharedAsset = {
      project_id: created.id,
      created_by: actorId,
      status: "ready" as const,
      upload_expires_at: new Date("2030-01-01T00:00:00.000Z"),
    };
    await database.db.assets.createMany({
      data: [
        {
          ...sharedAsset,
          id: assetId,
          kind: "ifc",
          original_file_name: "model.ifc",
          media_type: "application/x-step",
          size_bytes: 42n,
          original_object_key: objectKey,
        },
        {
          ...sharedAsset,
          id: pointCloudAssetId,
          kind: "point_cloud",
          original_file_name: "survey.laz",
          media_type: "application/vnd.laszip",
          size_bytes: 84n,
          original_object_key: pointCloudOriginalKey,
        },
      ],
    });
    await database.db.point_cloud_processing_results.create({
      data: {
        asset_id: pointCloudAssetId,
        format: "potree-v2",
        processor: "PotreeConverter",
        processor_version: "2.1.1",
        metadata_object_key: pointCloudKeys[0],
        hierarchy_object_key: pointCloudKeys[1],
        octree_object_key: pointCloudKeys[2],
        point_count: 10_000n,
        spacing: 0.5,
        processed_at: new Date(),
      },
    });
    await database.db.bcf_topics.create({
      data: {
        id: topicId,
        project_id: created.id,
        title: "Vue à nettoyer",
        created_by: actorId,
      },
    });
    await database.db.bcf_viewpoints.create({
      data: {
        id: viewpointId,
        topic_id: topicId,
        data: {
          guid: viewpointId,
          perspectiveCamera: {
            cameraViewPoint: { x: 1, y: 2, z: 3 },
            cameraDirection: { x: 0, y: 0, z: -1 },
            cameraUpVector: { x: 0, y: 1, z: 0 },
            fieldOfView: 50,
          },
        },
        target_distance: 10,
        snapshot_object_key: snapshotObjectKey,
        snapshot_media_type: "image/png",
        snapshot_expected_size: 42n,
        created_by: actorId,
      },
    });

    await repository.requestDeletion(created.id, new Date());
    await expect(
      repository.findForActor(actorId, created.id),
    ).resolves.toBeUndefined();
    const jobs = await database.db.deletion_jobs.findMany({
      where: { resource_id: created.id },
      select: { object_keys: true },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.object_keys).toEqual(
      expect.arrayContaining([
        objectKey,
        pointCloudOriginalKey,
        snapshotObjectKey,
        ...pointCloudKeys,
      ]),
    );
  });
});
