import { randomUUID } from "node:crypto";

import { createPrismaDatabase } from "@mnemo/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaAssistantThreadRepository } from "./prisma-assistant-thread-repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for assistant integration tests");
}

const database = createPrismaDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const actorId = randomUUID();
const otherActorId = randomUUID();
const projectId = randomUUID();
const assetId = randomUUID();

describe("PrismaAssistantThreadRepository", () => {
  beforeAll(async () => {
    await database.db.users.createMany({
      data: [
        {
          id: actorId,
          email: `${actorId}@test.mnemo.local`,
          display_name: "Assistant actor",
        },
        {
          id: otherActorId,
          email: `${otherActorId}@test.mnemo.local`,
          display_name: "Other actor",
        },
      ],
    });
    await database.db.projects.create({
      data: {
        id: projectId,
        name: "Assistant persistence",
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
    await database.db.users.deleteMany({
      where: { id: { in: [actorId, otherActorId] } },
    });
    await database.close();
  });

  it("replaces ordered messages atomically and isolates the actor", async () => {
    const repository = new PrismaAssistantThreadRepository(database.db);
    const threadId = randomUUID();
    const createdAt = new Date("2026-09-09T10:00:00.000Z");
    await repository.create({
      id: threadId,
      actorId,
      projectId,
      assetId,
      createdAt,
    });
    const messages = [
      {
        id: "user-1",
        role: "user" as const,
        parts: [{ type: "text", text: "Montre les murs" }],
      },
      {
        id: "assistant-1",
        role: "assistant" as const,
        parts: [{ type: "text", text: "Voici 12 murs." }],
      },
    ];

    await expect(
      repository.replaceMessages({
        actorId,
        projectId,
        assetId,
        threadId,
        messages,
        title: "Montre les murs",
        updatedAt: new Date("2026-09-09T10:01:00.000Z"),
      }),
    ).resolves.toBe(true);
    await expect(repository.messages(threadId)).resolves.toEqual(messages);
    await expect(
      repository.find({ actorId, projectId, assetId, threadId }),
    ).resolves.toMatchObject({ title: "Montre les murs" });
    await expect(
      repository.find({
        actorId: otherActorId,
        projectId,
        assetId,
        threadId,
      }),
    ).resolves.toBeNull();

    await repository.replaceMessages({
      actorId,
      projectId,
      assetId,
      threadId,
      messages: [messages[0]!],
      title: "Montre les murs",
      updatedAt: new Date("2026-09-09T10:02:00.000Z"),
    });
    await expect(repository.messages(threadId)).resolves.toEqual([messages[0]]);

    const persistedRows = await database.db.assistant_messages.findMany({
      where: { thread_id: threadId },
    });
    expect(persistedRows).toHaveLength(1);
  });

  it("cascades messages when a thread is deleted", async () => {
    const repository = new PrismaAssistantThreadRepository(database.db);
    const threadId = randomUUID();
    await repository.create({
      id: threadId,
      actorId,
      projectId,
      assetId,
      createdAt: new Date(),
    });
    await repository.replaceMessages({
      actorId,
      projectId,
      assetId,
      threadId,
      messages: [
        {
          id: "user-delete",
          role: "user",
          parts: [{ type: "text", text: "À supprimer" }],
        },
      ],
      title: "À supprimer",
      updatedAt: new Date(),
    });

    await expect(
      repository.delete({ actorId, projectId, assetId, threadId }),
    ).resolves.toBe(true);
    await expect(repository.messages(threadId)).resolves.toEqual([]);
    const threadRows = await database.db.assistant_threads.findMany({
      where: { id: threadId },
    });
    expect(threadRows).toHaveLength(0);
  });
});
