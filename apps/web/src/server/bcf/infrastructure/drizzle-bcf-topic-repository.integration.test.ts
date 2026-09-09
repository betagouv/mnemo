import { randomUUID } from "node:crypto";

import {
  assets,
  createDatabase,
  projectMembers,
  projects,
  users,
} from "@mnemo/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DrizzleBcfTopicRepository } from "./drizzle-bcf-topic-repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for BCF integration tests");
}

const database = createDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const actorId = randomUUID();
const projectId = randomUUID();
const assetId = randomUUID();
const topicId = randomUUID();
const commentId = randomUUID();
const viewpointId = randomUUID();
const createdAt = new Date("2026-09-09T19:30:00.000Z");

describe("DrizzleBcfTopicRepository", () => {
  beforeAll(async () => {
    await database.db.insert(users).values({
      id: actorId,
      email: `${actorId}@test.mnemo.local`,
      displayName: "BCF author",
    });
    await database.db.insert(projects).values({
      id: projectId,
      name: "BCF project",
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
      status: "ready",
      createdBy: actorId,
      uploadExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
  });

  afterAll(async () => {
    await database.db.delete(projects).where(eq(projects.id, projectId));
    await database.db.delete(users).where(eq(users.id, actorId));
    await database.close();
  });

  it("round-trips topics, comments, status, and an IFC GlobalId", async () => {
    const repository = new DrizzleBcfTopicRepository(database.db);
    const created = await repository.create({
      id: topicId,
      projectId,
      title: "Porte à vérifier",
      description: "Contrôler le sens d’ouverture",
      type: "issue",
      priority: "high",
      component: {
        assetId,
        expressId: 42,
        globalId: "0YvctA6Hn0pgmBdv0cPwH6",
      },
      createdBy: actorId,
      createdAt,
    });
    expect(created).toMatchObject({
      id: topicId,
      authorName: "BCF author",
      status: "open",
      components: [
        {
          assetId,
          expressId: 42,
          globalId: "0YvctA6Hn0pgmBdv0cPwH6",
        },
      ],
    });

    await expect(
      repository.addComment({
        id: commentId,
        projectId,
        topicId,
        authorId: actorId,
        comment: "À corriger avant livraison",
        createdAt: new Date("2026-09-09T19:31:00.000Z"),
      }),
    ).resolves.toMatchObject({
      comments: [
        {
          id: commentId,
          authorName: "BCF author",
          comment: "À corriger avant livraison",
        },
      ],
    });

    await expect(
      repository.updateStatus({
        projectId,
        topicId,
        status: "resolved",
        updatedAt: new Date("2026-09-09T19:32:00.000Z"),
      }),
    ).resolves.toMatchObject({ status: "resolved" });

    await expect(
      repository.createViewpoint({
        id: viewpointId,
        projectId,
        topicId,
        data: {
          guid: viewpointId,
          perspectiveCamera: {
            cameraViewPoint: { x: 1, y: 2, z: 3 },
            cameraDirection: { x: 0, y: 0, z: -1 },
            cameraUpVector: { x: 0, y: 1, z: 0 },
            fieldOfView: 50,
            aspectRatio: 16 / 9,
          },
          components: {
            selection: [{ ifcGuid: "0YvctA6Hn0pgmBdv0cPwH6" }],
          },
        },
        targetDistance: 12,
        snapshotObjectKey: `projects/${projectId}/bcf/${topicId}/viewpoints/${viewpointId}/snapshot.png`,
        snapshotMediaType: "image/png",
        snapshotExpectedSize: 42,
        createdBy: actorId,
        createdAt: new Date("2026-09-09T19:33:00.000Z"),
      }),
    ).resolves.toMatchObject({
      viewpoints: [
        {
          id: viewpointId,
          snapshotUploadedAt: null,
          targetDistance: 12,
        },
      ],
    });

    await expect(
      repository.markViewpointSnapshotUploaded({
        projectId,
        topicId,
        viewpointId,
        uploadedAt: new Date("2026-09-09T19:34:00.000Z"),
      }),
    ).resolves.toMatchObject({
      viewpoints: [
        {
          id: viewpointId,
          snapshotUploadedAt: "2026-09-09T19:34:00.000Z",
        },
      ],
    });

    await database.db.delete(assets).where(eq(assets.id, assetId));
    await expect(repository.list(projectId)).resolves.toMatchObject([
      {
        components: [
          {
            assetId: null,
            globalId: "0YvctA6Hn0pgmBdv0cPwH6",
          },
        ],
      },
    ]);
  });
});
