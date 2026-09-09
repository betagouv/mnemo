import type {
  AssistantMessage,
  AssistantThreadHistory,
  AssistantThreadSummary,
} from "@mnemo/contracts/assistant";

import { AssistantThreadAccessDeniedError } from "./assistant-thread-errors";
import type { AssistantThreadRepository } from "./assistant-thread-repository";

type AuthorizeIfcAsset = (
  actorId: string,
  input: { projectId: string; assetId: string },
) => Promise<{ kind: string }>;

function titleFrom(messages: AssistantMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) return "Nouvelle conversation";

  const text = firstUserMessage.parts
    .filter(
      (part): part is typeof part & { text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "Nouvelle conversation";
  return text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}…`;
}

export class AssistantThreadService {
  constructor(
    private readonly repository: AssistantThreadRepository,
    private readonly authorizeIfcAsset: AuthorizeIfcAsset,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async list(
    actorId: string,
    input: { projectId: string; assetId: string },
  ): Promise<AssistantThreadSummary[]> {
    await this.authorize(actorId, input);
    return this.repository.list({ actorId, ...input });
  }

  async create(
    actorId: string,
    input: { projectId: string; assetId: string },
  ): Promise<AssistantThreadSummary> {
    await this.authorize(actorId, input);
    return this.repository.create({
      id: this.createId(),
      actorId,
      ...input,
      createdAt: this.now(),
    });
  }

  async history(
    actorId: string,
    input: { projectId: string; assetId: string; threadId: string },
  ): Promise<AssistantThreadHistory> {
    await this.authorize(actorId, input);
    const thread = await this.repository.find({ actorId, ...input });
    if (!thread) throw new AssistantThreadAccessDeniedError();
    return { thread, messages: await this.repository.messages(thread.id) };
  }

  async requireForChat(
    actorId: string,
    input: { projectId: string; assetId: string; threadId?: string },
  ): Promise<AssistantThreadSummary> {
    await this.authorize(actorId, input);
    if (!input.threadId) {
      return this.repository.create({
        id: this.createId(),
        actorId,
        projectId: input.projectId,
        assetId: input.assetId,
        createdAt: this.now(),
      });
    }
    const thread = await this.repository.find({
      actorId,
      projectId: input.projectId,
      assetId: input.assetId,
      threadId: input.threadId,
    });
    if (!thread) throw new AssistantThreadAccessDeniedError();
    return thread;
  }

  async save(
    actorId: string,
    input: {
      projectId: string;
      assetId: string;
      threadId: string;
      messages: AssistantMessage[];
    },
  ) {
    const boundedMessages = input.messages.slice(-100);
    const saved = await this.repository.replaceMessages({
      actorId,
      projectId: input.projectId,
      assetId: input.assetId,
      threadId: input.threadId,
      messages: boundedMessages,
      title: titleFrom(input.messages),
      updatedAt: this.now(),
    });
    if (!saved) throw new AssistantThreadAccessDeniedError();
  }

  async delete(
    actorId: string,
    input: { projectId: string; assetId: string; threadId: string },
  ) {
    await this.authorize(actorId, input);
    const deleted = await this.repository.delete({ actorId, ...input });
    if (!deleted) throw new AssistantThreadAccessDeniedError();
    return { deleted: true as const };
  }

  private async authorize(
    actorId: string,
    input: { projectId: string; assetId: string },
  ) {
    const asset = await this.authorizeIfcAsset(actorId, input);
    if (asset.kind !== "ifc") throw new AssistantThreadAccessDeniedError();
  }
}
