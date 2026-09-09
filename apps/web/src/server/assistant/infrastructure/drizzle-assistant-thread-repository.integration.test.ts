import { randomUUID } from "node:crypto";

import {
  assets,
  assistantMessages,
  assistantThreads,
  createDatabase,
  projectMembers,
  projects,
  users,
} from "@mnemo/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DrizzleAssistantThreadRepository } from "./drizzle-assistant-thread-repository";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for assistant integration tests");
}

const database = createDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const actorId = randomUUID();
const otherActorId = randomUUID();
const projectId = randomUUID();
const assetId = randomUUID();

describe("DrizzleAssistantThreadRepository", () => {
  beforeAll(async () => {
    await database.db.insert(users).values([
      {
        id: actorId,
        email: `${actorId}@test.mnemo.local`,
        displayName: "Assistant actor",
      },
      {
        id: otherActorId,
        email: `${otherActorId}@test.mnemo.local`,
        displayName: "Other actor",
      },
    ]);
    await database.db.insert(projects).values({
      id: projectId,
      name: "Assistant persistence",
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
    await database.db.delete(users).where(eq(users.id, otherActorId));
    await database.close();
  });

  it("replaces ordered messages atomically and isolates the actor", async () => {
    const repository = new DrizzleAssistantThreadRepository(database.db);
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

    const persistedRows = await database.db
      .select()
      .from(assistantMessages)
      .where(eq(assistantMessages.threadId, threadId));
    expect(persistedRows).toHaveLength(1);
  });

  it("cascades messages when a thread is deleted", async () => {
    const repository = new DrizzleAssistantThreadRepository(database.db);
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
    const threadRows = await database.db
      .select()
      .from(assistantThreads)
      .where(eq(assistantThreads.id, threadId));
    expect(threadRows).toHaveLength(0);
  });
});
