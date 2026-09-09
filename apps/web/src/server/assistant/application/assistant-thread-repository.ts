import type {
  AssistantMessage,
  AssistantThreadSummary,
} from "@mnemo/contracts/assistant";

export interface AssistantThreadRepository {
  list(input: {
    actorId: string;
    projectId: string;
    assetId: string;
  }): Promise<AssistantThreadSummary[]>;
  find(input: {
    actorId: string;
    projectId: string;
    assetId: string;
    threadId: string;
  }): Promise<AssistantThreadSummary | null>;
  create(input: {
    id: string;
    actorId: string;
    projectId: string;
    assetId: string;
    createdAt: Date;
  }): Promise<AssistantThreadSummary>;
  messages(threadId: string): Promise<AssistantMessage[]>;
  replaceMessages(input: {
    actorId: string;
    projectId: string;
    assetId: string;
    threadId: string;
    messages: AssistantMessage[];
    title: string;
    updatedAt: Date;
  }): Promise<boolean>;
  delete(input: {
    actorId: string;
    projectId: string;
    assetId: string;
    threadId: string;
  }): Promise<boolean>;
}
