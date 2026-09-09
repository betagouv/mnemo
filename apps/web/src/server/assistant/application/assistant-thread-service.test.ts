import type {
  AssistantMessage,
  AssistantThreadSummary,
} from "@mnemo/contracts/assistant";
import { describe, expect, it, vi } from "vitest";

import { AssistantThreadAccessDeniedError } from "./assistant-thread-errors";
import type { AssistantThreadRepository } from "./assistant-thread-repository";
import { AssistantThreadService } from "./assistant-thread-service";

const actorId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000010";
const assetId = "00000000-0000-4000-8000-000000000020";
const threadId = "00000000-0000-4000-8000-000000000030";
const now = new Date("2026-09-09T10:00:00.000Z");

class InMemoryAssistantThreadRepository implements AssistantThreadRepository {
  threads: AssistantThreadSummary[] = [];
  messagesByThread = new Map<string, AssistantMessage[]>();

  async list(input: { actorId: string; projectId: string; assetId: string }) {
    return this.threads.filter(
      (thread) =>
        input.actorId === actorId &&
        thread.projectId === input.projectId &&
        thread.assetId === input.assetId,
    );
  }

  async find(input: {
    actorId: string;
    projectId: string;
    assetId: string;
    threadId: string;
  }) {
    return (
      (await this.list(input)).find((thread) => thread.id === input.threadId) ??
      null
    );
  }

  async create(input: {
    id: string;
    actorId: string;
    projectId: string;
    assetId: string;
    createdAt: Date;
  }) {
    const thread = {
      id: input.id,
      projectId: input.projectId,
      assetId: input.assetId,
      title: "Nouvelle conversation",
      createdAt: input.createdAt.toISOString(),
      updatedAt: input.createdAt.toISOString(),
    };
    this.threads.push(thread);
    return thread;
  }

  async messages(threadId: string) {
    return this.messagesByThread.get(threadId) ?? [];
  }

  async replaceMessages(input: {
    actorId: string;
    projectId: string;
    assetId: string;
    threadId: string;
    messages: AssistantMessage[];
    title: string;
    updatedAt: Date;
  }) {
    const thread = await this.find(input);
    if (!thread) return false;
    thread.title = input.title;
    thread.updatedAt = input.updatedAt.toISOString();
    this.messagesByThread.set(input.threadId, input.messages);
    return true;
  }

  async delete(input: {
    actorId: string;
    projectId: string;
    assetId: string;
    threadId: string;
  }) {
    const thread = await this.find(input);
    if (!thread) return false;
    this.threads = this.threads.filter((item) => item.id !== input.threadId);
    this.messagesByThread.delete(input.threadId);
    return true;
  }
}

function createService(
  repository = new InMemoryAssistantThreadRepository(),
  authorize = vi.fn().mockResolvedValue({ kind: "ifc" }),
) {
  return {
    authorize,
    repository,
    service: new AssistantThreadService(
      repository,
      authorize,
      () => now,
      () => threadId,
    ),
  };
}

describe("AssistantThreadService", () => {
  it("creates and restores an actor-scoped IFC conversation", async () => {
    const { service } = createService();
    const thread = await service.create(actorId, { projectId, assetId });

    await expect(
      service.history(actorId, { projectId, assetId, threadId: thread.id }),
    ).resolves.toEqual({ thread, messages: [] });
  });

  it("derives the durable title from the first user message", async () => {
    const { repository, service } = createService();
    await service.create(actorId, { projectId, assetId });
    const messages: AssistantMessage[] = [
      {
        id: "message-1",
        role: "user",
        parts: [{ type: "text", text: "  Affiche   le niveau N2 en bleu  " }],
      },
      {
        id: "message-2",
        role: "assistant",
        parts: [{ type: "text", text: "C’est fait." }],
      },
    ];

    await service.save(actorId, { projectId, assetId, threadId, messages });

    expect(repository.threads[0]?.title).toBe("Affiche le niveau N2 en bleu");
    await expect(
      service.history(actorId, { projectId, assetId, threadId }),
    ).resolves.toMatchObject({ messages });
  });

  it("rejects a point-cloud context and an unknown thread", async () => {
    const pointCloud = createService(
      new InMemoryAssistantThreadRepository(),
      vi.fn().mockResolvedValue({ kind: "point_cloud" }),
    );
    await expect(
      pointCloud.service.list(actorId, { projectId, assetId }),
    ).rejects.toBeInstanceOf(AssistantThreadAccessDeniedError);

    const { service } = createService();
    await expect(
      service.history(actorId, { projectId, assetId, threadId }),
    ).rejects.toBeInstanceOf(AssistantThreadAccessDeniedError);
  });

  it("keeps the persisted history within the transport limit", async () => {
    const { repository, service } = createService();
    await service.create(actorId, { projectId, assetId });
    const messages: AssistantMessage[] = Array.from(
      { length: 101 },
      (_, index) => ({
        id: `message-${index}`,
        role: "user" as const,
        parts: [{ type: "text", text: `Message ${index}` }],
      }),
    );

    await service.save(actorId, { projectId, assetId, threadId, messages });

    expect(repository.messagesByThread.get(threadId)).toHaveLength(100);
    expect(repository.messagesByThread.get(threadId)?.[0]?.id).toBe(
      "message-1",
    );
  });
});
