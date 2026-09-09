import { randomUUID } from "node:crypto";

import {
  assets,
  bcfTopics,
  bcfViewpoints,
  createDatabase,
  deletionJobs,
  projects,
  users,
} from "@mnemo/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DrizzleProjectRepository } from "./drizzle-project-repository";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for project integration tests");
}

const database = createDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const actorId = randomUUID();
const otherActorId = randomUUID();
const deletionResourceIds: string[] = [];

describe("DrizzleProjectRepository", () => {
  beforeAll(async () => {
    await database.db.insert(users).values([
      {
        id: actorId,
        email: `${actorId}@test.mnemo.local`,
        displayName: "Repository test actor",
      },
      {
        id: otherActorId,
        email: `${otherActorId}@test.mnemo.local`,
        displayName: "Unrelated actor",
      },
    ]);
  });

  afterAll(async () => {
    for (const resourceId of deletionResourceIds) {
      await database.db
        .delete(deletionJobs)
        .where(eq(deletionJobs.resourceId, resourceId));
    }
    await database.db.delete(projects).where(eq(projects.createdBy, actorId));
    await database.db.delete(users).where(eq(users.id, actorId));
    await database.db.delete(users).where(eq(users.id, otherActorId));
    await database.close();
  });

  it("creates an owner membership and lists it for the actor", async () => {
    const repository = new DrizzleProjectRepository(database.db);

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

  it("archives a project and snapshots its object keys for cleanup", async () => {
    const repository = new DrizzleProjectRepository(database.db);
    const created = await repository.createForActor(actorId, {
      name: "Projet à supprimer",
    });
    deletionResourceIds.push(created.id);
    const assetId = randomUUID();
    const objectKey = `projects/${created.id}/assets/${assetId}/original.ifc`;
    const topicId = randomUUID();
    const viewpointId = randomUUID();
    const snapshotObjectKey = `projects/${created.id}/bcf/${topicId}/viewpoints/${viewpointId}/snapshot.png`;
    await database.db.insert(assets).values({
      id: assetId,
      projectId: created.id,
      kind: "ifc",
      originalFileName: "model.ifc",
      mediaType: "application/x-step",
      sizeBytes: 42,
      originalObjectKey: objectKey,
      status: "ready",
      createdBy: actorId,
      uploadExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    await database.db.insert(bcfTopics).values({
      id: topicId,
      projectId: created.id,
      title: "Vue à nettoyer",
      createdBy: actorId,
    });
    await database.db.insert(bcfViewpoints).values({
      id: viewpointId,
      topicId,
      data: {
        guid: viewpointId,
        perspectiveCamera: {
          cameraViewPoint: { x: 1, y: 2, z: 3 },
          cameraDirection: { x: 0, y: 0, z: -1 },
          cameraUpVector: { x: 0, y: 1, z: 0 },
          fieldOfView: 50,
        },
      },
      targetDistance: 10,
      snapshotObjectKey,
      snapshotMediaType: "image/png",
      snapshotExpectedSize: 42,
      createdBy: actorId,
    });

    await repository.requestDeletion(created.id, new Date());

    await expect(
      repository.findForActor(actorId, created.id),
    ).resolves.toBeUndefined();
    await expect(
      database.db
        .select({ objectKeys: deletionJobs.objectKeys })
        .from(deletionJobs)
        .where(eq(deletionJobs.resourceId, created.id)),
    ).resolves.toEqual([{ objectKeys: [objectKey, snapshotObjectKey] }]);
  });
});
