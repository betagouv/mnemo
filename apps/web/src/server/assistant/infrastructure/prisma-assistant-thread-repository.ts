import {
  assistantMessageSchema,
  type AssistantMessage,
  type AssistantThreadSummary,
} from "@mnemo/contracts/assistant";
import {
  Prisma,
  type MnemoPrismaDatabase,
  type PrismaAssistantThreadRecord,
} from "@mnemo/database";

import type { AssistantThreadRepository } from "../application/assistant-thread-repository";

function toSummary(row: PrismaAssistantThreadRecord): AssistantThreadSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    assetId: row.asset_id,
    title: row.title,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function contextWhere(input: {
  actorId: string;
  projectId: string;
  assetId: string;
}) {
  return {
    created_by: input.actorId,
    project_id: input.projectId,
    asset_id: input.assetId,
  };
}

export class PrismaAssistantThreadRepository implements AssistantThreadRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async list(input: { actorId: string; projectId: string; assetId: string }) {
    const rows = await this.database.assistant_threads.findMany({
      where: contextWhere(input),
      orderBy: { updated_at: "desc" },
    });
    return rows.map(toSummary);
  }

  async find(input: {
    actorId: string;
    projectId: string;
    assetId: string;
    threadId: string;
  }) {
    const row = await this.database.assistant_threads.findFirst({
      where: { ...contextWhere(input), id: input.threadId },
    });
    return row ? toSummary(row) : null;
  }

  async create(input: {
    id: string;
    actorId: string;
    projectId: string;
    assetId: string;
    createdAt: Date;
  }) {
    return toSummary(
      await this.database.assistant_threads.create({
        data: {
          id: input.id,
          project_id: input.projectId,
          asset_id: input.assetId,
          created_by: input.actorId,
          created_at: input.createdAt,
          updated_at: input.createdAt,
        },
      }),
    );
  }

  async messages(threadId: string): Promise<AssistantMessage[]> {
    const rows = await this.database.assistant_messages.findMany({
      where: { thread_id: threadId },
      orderBy: { ordinal: "asc" },
      select: { payload: true },
    });
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
    return this.database.$transaction(async (transaction) => {
      const updated = await transaction.assistant_threads.updateMany({
        where: { ...contextWhere(input), id: input.threadId },
        data: { title: input.title, updated_at: input.updatedAt },
      });
      if (!updated.count) return false;

      await transaction.assistant_messages.deleteMany({
        where: { thread_id: input.threadId },
      });
      if (input.messages.length) {
        await transaction.assistant_messages.createMany({
          data: input.messages.map((message, ordinal) => ({
            thread_id: input.threadId,
            ordinal,
            payload: JSON.parse(
              JSON.stringify(message),
            ) as Prisma.InputJsonValue,
            created_at: input.updatedAt,
          })),
        });
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
    const result = await this.database.assistant_threads.deleteMany({
      where: { ...contextWhere(input), id: input.threadId },
    });
    return result.count === 1;
  }
}
