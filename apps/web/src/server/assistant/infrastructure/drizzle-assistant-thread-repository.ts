import {
  assistantMessageSchema,
  type AssistantMessage,
  type AssistantThreadSummary,
} from "@mnemo/contracts/assistant";
import {
  assistantMessages,
  assistantThreads,
  type MnemoDatabase,
} from "@mnemo/database";
import { and, asc, desc, eq } from "drizzle-orm";

import type { AssistantThreadRepository } from "../application/assistant-thread-repository";

function toSummary(
  thread: typeof assistantThreads.$inferSelect,
): AssistantThreadSummary {
  return {
    id: thread.id,
    projectId: thread.projectId,
    assetId: thread.assetId,
    title: thread.title,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
  };
}

function contextWhere(input: {
  actorId: string;
  projectId: string;
  assetId: string;
}) {
  return and(
    eq(assistantThreads.createdBy, input.actorId),
    eq(assistantThreads.projectId, input.projectId),
    eq(assistantThreads.assetId, input.assetId),
  );
}

export class DrizzleAssistantThreadRepository implements AssistantThreadRepository {
  constructor(private readonly database: MnemoDatabase) {}

  async list(input: { actorId: string; projectId: string; assetId: string }) {
    const rows = await this.database
      .select()
      .from(assistantThreads)
      .where(contextWhere(input))
      .orderBy(desc(assistantThreads.updatedAt));
    return rows.map(toSummary);
  }

  async find(input: {
    actorId: string;
    projectId: string;
    assetId: string;
    threadId: string;
  }) {
    const [row] = await this.database
      .select()
      .from(assistantThreads)
      .where(and(contextWhere(input), eq(assistantThreads.id, input.threadId)))
      .limit(1);
    return row ? toSummary(row) : null;
  }

  async create(input: {
    id: string;
    actorId: string;
    projectId: string;
    assetId: string;
    createdAt: Date;
  }) {
    const [row] = await this.database
      .insert(assistantThreads)
      .values({
        id: input.id,
        projectId: input.projectId,
        assetId: input.assetId,
        createdBy: input.actorId,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      })
      .returning();
    if (!row) throw new Error("Assistant thread could not be created");
    return toSummary(row);
  }

  async messages(threadId: string): Promise<AssistantMessage[]> {
    const rows = await this.database
      .select({ payload: assistantMessages.payload })
      .from(assistantMessages)
      .where(eq(assistantMessages.threadId, threadId))
      .orderBy(asc(assistantMessages.ordinal));
    return rows.map((row) => assistantMessageSchema.parse(row.payload));
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
    return this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(assistantThreads)
        .set({ title: input.title, updatedAt: input.updatedAt })
        .where(
          and(contextWhere(input), eq(assistantThreads.id, input.threadId)),
        )
        .returning({ id: assistantThreads.id });
      if (!updated) return false;

      await transaction
        .delete(assistantMessages)
        .where(eq(assistantMessages.threadId, input.threadId));
      if (input.messages.length) {
        await transaction.insert(assistantMessages).values(
          input.messages.map((message, ordinal) => ({
            threadId: input.threadId,
            ordinal,
            payload: message,
            createdAt: input.updatedAt,
          })),
        );
      }
      return true;
    });
  }

  async delete(input: {
    actorId: string;
    projectId: string;
    assetId: string;
    threadId: string;
  }) {
    const deleted = await this.database
      .delete(assistantThreads)
      .where(and(contextWhere(input), eq(assistantThreads.id, input.threadId)))
      .returning({ id: assistantThreads.id });
    return deleted.length === 1;
  }
}
