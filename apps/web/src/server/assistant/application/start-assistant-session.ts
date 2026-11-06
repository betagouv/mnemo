import type { FrontendTools } from "@assistant-ui/ai-sdk";
import { assistantMessageSchema } from "@mnemo/contracts/assistant";
import { type UIMessage, type ToolSet } from "ai";
import type { AssistantConfiguration } from "@/shared/config/assistant/server-only";
import { streamAssistantChat } from "./assistant-chat";
import {
  AssistantNotConfiguredError,
  AssistantMcpUnavailableError,
} from "./assistant-session-errors";

export type AssistantSessionInput = {
  assetId: string;
  threadId: string;
  messages: UIMessage[];
  tools: FrontendTools;
} & {
  actorId: string;
  projectId: string;
  source: {
    assetId: string;
    objectKey: string;
    sizeBytes: number;
  };
};

export type AssistantSessionDependencies = {
  configuration: () => AssistantConfiguration;
  openModelTools: (
    source: AssistantSessionInput["source"],
  ) => Promise<{ tools: ToolSet }>;
  persistMessages: (
    actorId: string,
    input: {
      projectId: string;
      assetId: string;
      threadId: string;
      messages: ReturnType<typeof assistantMessageSchema.parse>[];
    },
  ) => Promise<unknown>;
};

export async function startAssistantSession(
  input: AssistantSessionInput,
  dependencies: AssistantSessionDependencies,
) {
  let configuration;
  try {
    configuration = dependencies.configuration();
  } catch {
    throw new AssistantNotConfiguredError(
      "OPENROUTER_API_KEY is not configured",
    );
  }
  let mcpSession;
  try {
    mcpSession = await dependencies.openModelTools(input.source);
  } catch (error) {
    console.error("IFC MCP session could not be prepared", {
      assetId: input.assetId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AssistantMcpUnavailableError(
      "IFC-Lite MCP is unavailable for this model",
    );
  }
  return streamAssistantChat({
    configuration,
    messages: input.messages,
    tools: input.tools,
    mcpTools: mcpSession.tools,
    persistMessages: async (messages) => {
      try {
        await dependencies.persistMessages(input.actorId, {
          projectId: input.projectId,
          assetId: input.assetId,
          threadId: input.threadId,
          messages: messages.map((message) =>
            assistantMessageSchema.parse(message),
          ),
        });
      } catch (error) {
        console.error("Assistant conversation could not be persisted", {
          assetId: input.assetId,
          threadId: input.threadId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}
