import { getAssistantConfiguration } from "@/shared/config/assistant/server-only";
import { getIfcMcpTools } from "./infrastructure/ifc-mcp-runtime";
import { getAssistantThreadService } from "./assistant-thread-service-factory";
import {
  startAssistantSession,
  type AssistantSessionInput,
} from "./application/start-assistant-session";

export function startRuntimeAssistantSession(input: AssistantSessionInput) {
  return startAssistantSession(input, {
    configuration: getAssistantConfiguration,
    openModelTools: getIfcMcpTools,
    persistMessages: (actorId, messages) =>
      getAssistantThreadService().save(actorId, messages),
  });
}
