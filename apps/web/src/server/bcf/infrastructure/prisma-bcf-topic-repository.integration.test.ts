import { randomUUID } from "node:crypto";

import { createPrismaDatabase } from "@mnemo/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaBcfTopicRepository } from "./prisma-bcf-topic-repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for BCF integration tests");
}

const database = createPrismaDatabase({
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

describe("PrismaBcfTopicRepository", () => {
  beforeAll(async () => {
    await database.db.users.create({
      data: {
        id: actorId,
        email: `${actorId}@test.mnemo.local`,
        display_name: "BCF author",
      },
    });
    await database.db.projects.create({
      data: {
        id: projectId,
        title: "BCF project",
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

  it("round-trips topics, comments, status, and an IFC GlobalId", async () => {
    const repository = new PrismaBcfTopicRepository(database.db);
    const created = await repository.create({
      id: topicId,
      projectId,
      title: "Porte à vérifier",
      description: "Contrôler le sens d’ouverture",
      type: "issue",
      priority: "high",
      assignedTo: null,
      dueDate: null,
      labels: [],
      components: [
        {
          assetId,
          expressId: 42,
          globalId: "0YvctA6Hn0pgmBdv0cPwH6",
        },
      ],
      createdBy: actorId,
      createdAt,
    });
    expect(created).toMatchObject({
      id: topicId,
      authorName: "BCF author",
      status: "Open",
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
          snapshotUploadedAt: "2026-09-09T19:33:00.000Z",
          targetDistance: 12,
        },
      ],
    });

    await database.db.assets.delete({ where: { id: assetId } });
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

  it("imports external authors once per project BCF GUID", async () => {
    const repository = new PrismaBcfTopicRepository(database.db);
    const importedTopicId = randomUUID();
    const importedTopicGuid = randomUUID();
    const importedCommentId = randomUUID();
    const importedCommentGuid = randomUUID();
    const importedViewpointId = randomUUID();
    const importedViewpointGuid = randomUUID();
    const record = {
      id: importedTopicId,
      bcfGuid: importedTopicGuid,
      projectId,
      title: "Remarque importée",
      description: null,
      type: "issue" as const,
      status: "Open" as const,
      priority: "normal" as const,
      createdBy: actorId,
      externalAuthor: "architecte@example.fr",
      createdAt,
      updatedAt: createdAt,
      components: [{ id: randomUUID(), globalId: "0YvctA6Hn0pgmBdv0cPwH6" }],
      comments: [
        {
          id: importedCommentId,
          bcfGuid: importedCommentGuid,
          externalAuthor: "controle@example.fr",
          comment: "À reprendre",
          viewpointBcfGuid: importedViewpointGuid,
          createdAt,
        },
      ],
      viewpoints: [
        {
          id: importedViewpointId,
          bcfGuid: importedViewpointGuid,
          data: {
            guid: importedViewpointGuid,
            perspectiveCamera: {
              cameraViewPoint: { x: 1, y: 2, z: 3 },
              cameraDirection: { x: 0, y: 0, z: -1 },
              cameraUpVector: { x: 0, y: 1, z: 0 },
              fieldOfView: 50,
            },
          },
          targetDistance: 10,
          snapshotObjectKey: null,
          snapshotMediaType: null,
          snapshotExpectedSize: null,
          snapshotUploadedAt: null,
          externalAuthor: "architecte@example.fr",
          createdAt,
        },
      ],
    };

    await expect(repository.importTopics([record])).resolves.toEqual({
      insertedTopicIds: [importedTopicId],
      skippedBcfGuids: [],
    });
    await expect(
      repository.importTopics([{ ...record, id: randomUUID() }]),
    ).resolves.toEqual({
      insertedTopicIds: [],
      skippedBcfGuids: [importedTopicGuid],
    });
    await expect(repository.list(projectId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: importedTopicId,
          bcfGuid: importedTopicGuid,
          authorName: "architecte@example.fr",
          comments: [
            expect.objectContaining({
              bcfGuid: importedCommentGuid,
              authorName: "controle@example.fr",
              viewpointBcfGuid: importedViewpointGuid,
            }),
          ],
          viewpoints: [
            expect.objectContaining({
              bcfGuid: importedViewpointGuid,
              authorName: "architecte@example.fr",
            }),
          ],
        }),
      ]),
    );
  });
});

describe("BCF upload transactions", () => {
  const database = createPrismaDatabase({
    connectionString: databaseUrl ?? "",
    maxConnections: 1,
  });
  afterAll(async () => database.close());
  it("consumes actor-scoped receipts once and cancels only the final copy's cleanup", async () => {
    const repository = new PrismaBcfTopicRepository(database.db);
    // This suite's user/project have their own lifecycle: no dependency on previous tests.
    const actor = randomUUID(),
      project = randomUUID(),
      receipt = randomUUID(),
      view = randomUUID(),
      id = randomUUID();
    await database.db.users.create({
      data: {
        id: actor,
        email: `${actor}@test.mnemo.local`,
        display_name: "Capture test",
      },
    });
    await database.db.projects.create({
      data: {
        id: project,
        title: "Captures",
        created_by: actor,
        project_members: { create: { user_id: actor, role: "owner" } },
      },
    });
    try {
      const future = new Date("2030-01-01T00:00:00Z");
      await repository.prepareUpload({
        id: receipt,
        projectId: project,
        actorId: actor,
        objectKey: `test-bcf/${receipt}`,
        mediaType: "image/png",
        sizeBytes: 8,
        expiresAt: future,
      });
      await repository.protectSnapshot(view, `test-bcf/${view}`, future);
      const input = {
        id,
        projectId: project,
        title: "Capture atomique",
        type: "Issue",
        priority: "Normal",
        assignedTo: null,
        dueDate: null,
        labels: [],
        components: [],
        createdBy: actor,
        createdAt,
        preparedViewpoint: {
          id: view,
          data: { guid: view },
          targetDistance: 10,
          snapshotObjectKey: `test-bcf/${view}`,
          snapshotMediaType: "image/png",
          snapshotExpectedSize: 8,
          createdBy: actor,
          createdAt,
          uploadId: receipt,
        },
      };
      const saved = await repository.create(input);
      expect(saved.viewpoints).toHaveLength(1);
      expect(await repository.findSnapshot(project, id, view)).toEqual({
        objectKey: `test-bcf/${view}`,
      });
      expect(await repository.findSnapshot(randomUUID(), id, view)).toBeNull();
      expect(
        await repository.findSnapshot(project, randomUUID(), view),
      ).toBeNull();
      expect(
        await database.db.bcf_snapshot_uploads.count({
          where: { id: receipt },
        }),
      ).toBe(0);
      expect(
        await database.db.deletion_jobs.count({ where: { id: view } }),
      ).toBe(0);
      expect(
        await database.db.deletion_jobs.count({
          where: { resource_id: receipt },
        }),
      ).toBe(1);
      const duplicate = randomUUID();
      await expect(
        repository.create({ ...input, id: duplicate }),
      ).rejects.toThrow("déjà été utilisée");
      expect(await repository.find(project, duplicate)).toBeNull();
      expect(await repository.find(randomUUID(), id)).toBeNull();
      await expect(
        repository.create({
          ...input,
          id: randomUUID(),
          preparedViewpoint: undefined,
          assignedTo: "outsider@example.fr",
        }),
      ).rejects.toThrow("membre du dossier");
    } finally {
      await database.db.deletion_jobs.deleteMany({
        where: { resource_id: { in: [receipt, view] } },
      });
      await database.db.projects.delete({ where: { id: project } });
      await database.db.users.delete({ where: { id: actor } });
    }
  });
});
