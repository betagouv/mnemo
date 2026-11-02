import type { FrontendTools } from "@assistant-ui/ai-sdk";
import {
  assistantMessageSchema,
  assistantThreadIdSchema,
} from "@mnemo/contracts/assistant";
import { assetIdSchema } from "@mnemo/contracts/assets";
import type { AssetKind, AssetStatus } from "@mnemo/domain";
import { projectIdSchema } from "@mnemo/contracts/projects";
import { safeValidateUIMessages, type UIMessage } from "ai";
import { z } from "zod";

import { getAssetService } from "@/server/assets/asset-service-factory";
import { AssetAccessDeniedError } from "@/server/assets/application/asset-errors";
import {
  AuthenticationRequiredError,
  resolveActor,
} from "@/server/auth/resolve-actor";
import { getAssistantConfiguration } from "@/shared/config/assistant/server-only";
import { getIfcMcpTools } from "@/server/assistant/infrastructure/ifc-mcp-runtime";
import { AssistantThreadAccessDeniedError } from "@/server/assistant/application/assistant-thread-errors";
import { getAssistantThreadService } from "@/server/assistant/assistant-thread-service-factory";

import { streamAssistantChat } from "../application/assistant-chat";

const maxRequestBytes = 1 * 1_024 * 1_024;
const maxMessages = 100;
const maxFrontendTools = 32;

const requestEnvelopeSchema = z.looseObject({
  assetId: assetIdSchema,
  threadId: assistantThreadIdSchema,
  messages: z.array(z.unknown()).max(maxMessages),
  tools: z.record(z.string().min(1).max(80), z.unknown()).optional(),
});

export class InvalidAssistantRequestError extends Error {}
export class AssistantRequestTooLargeError extends Error {}
export class AssistantNotConfiguredError extends Error {}
export class AssistantMcpUnavailableError extends Error {}

export type AuthorizedAssistantAsset = {
  id: string;
  kind: AssetKind;
  sizeBytes: number;
  originalObjectKey: string;
  status: AssetStatus;
};

type ValidatedAssistantRequest = {
  assetId: string;
  threadId: string;
  messages: UIMessage[];
  tools: FrontendTools;
};

type AuthorizedAssistantRequest = ValidatedAssistantRequest & {
  actorId: string;
  projectId: string;
  source: {
    assetId: string;
    objectKey: string;
    sizeBytes: number;
  };
};

export type AssistantHttpDependencies = {
  authorize: (
    actorId: string,
    input: { projectId: string; assetId: string },
  ) => Promise<AuthorizedAssistantAsset>;
  resolveActorId: () => string | Promise<string>;
  requireThread: (
    actorId: string,
    input: { projectId: string; assetId: string; threadId: string },
  ) => Promise<{ id: string }>;
  stream: (input: AuthorizedAssistantRequest) => Response | Promise<Response>;
};

async function readBoundedText(request: Request) {
  const announcedLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(announcedLength) && announcedLength > maxRequestBytes) {
    throw new AssistantRequestTooLargeError("Assistant request is too large");
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxRequestBytes) {
        await reader.cancel();
        throw new AssistantRequestTooLargeError(
          "Assistant request is too large",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function validateFrontendTools(value: unknown): FrontendTools {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidAssistantRequestError("Invalid frontend tools");
  }

  const entries = Object.entries(value);
  if (entries.length > maxFrontendTools) {
    throw new InvalidAssistantRequestError("Too many frontend tools");
  }

  for (const [name, tool] of entries) {
    if (
      typeof tool !== "object" ||
      tool === null ||
      Array.isArray(tool) ||
      typeof (tool as Record<string, unknown>).parameters !== "object" ||
      (tool as Record<string, unknown>).parameters === null
    ) {
      throw new InvalidAssistantRequestError(`Invalid frontend tool: ${name}`);
    }
  }

  return value as FrontendTools;
}

export async function parseAssistantRequest(
  request: Request,
): Promise<ValidatedAssistantRequest> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await readBoundedText(request));
  } catch (error) {
    if (error instanceof AssistantRequestTooLargeError) throw error;
    throw new InvalidAssistantRequestError("Invalid JSON request");
  }

  const envelope = requestEnvelopeSchema.safeParse(parsedJson);
  if (!envelope.success) {
    throw new InvalidAssistantRequestError("Invalid assistant request");
  }

  const validatedMessages = await safeValidateUIMessages({
    messages: envelope.data.messages,
  });
  if (!validatedMessages.success) {
    throw new InvalidAssistantRequestError("Invalid assistant messages");
  }

  return {
    assetId: envelope.data.assetId,
    threadId: envelope.data.threadId,
    messages: validatedMessages.data,
    tools: validateFrontendTools(envelope.data.tools),
  };
}

function jsonError(status: number, error: string) {
  return Response.json({ error }, { status });
}

const defaultDependencies: AssistantHttpDependencies = {
  authorize: (actorId, input) =>
    getAssetService().locateOriginal(actorId, input),
  resolveActorId: async () => (await resolveActor()).id,
  requireThread: (actorId, input) =>
    getAssistantThreadService().requireForChat(actorId, input),
  stream: async (input) => {
    let configuration;
    try {
      configuration = getAssistantConfiguration();
    } catch {
      throw new AssistantNotConfiguredError(
        "OPENROUTER_API_KEY is not configured",
      );
    }
    let mcpSession;
    try {
      mcpSession = await getIfcMcpTools(input.source);
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
          await getAssistantThreadService().save(input.actorId, {
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
  },
};

export async function handleAssistantHttpRequest(
  request: Request,
  rawProjectId: string,
  dependencies: AssistantHttpDependencies = defaultDependencies,
) {
  const projectId = projectIdSchema.safeParse(rawProjectId);
  if (!projectId.success) {
    return jsonError(400, "Projet invalide.");
  }

  try {
    const input = await parseAssistantRequest(request);
    const actorId = await dependencies.resolveActorId();
    const access = await dependencies.authorize(actorId, {
      projectId: projectId.data,
      assetId: input.assetId,
    });
    if (access.kind !== "ifc") {
      return jsonError(400, "L’assistant doit être lié à une maquette IFC.");
    }
    await dependencies.requireThread(actorId, {
      projectId: projectId.data,
      assetId: input.assetId,
      threadId: input.threadId,
    });
    return await dependencies.stream({
      ...input,
      actorId,
      projectId: projectId.data,
      source: {
        assetId: access.id,
        objectKey: access.originalObjectKey,
        sizeBytes: access.sizeBytes,
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return jsonError(401, "Authentification requise.");
    }
    if (error instanceof AssistantRequestTooLargeError) {
      return jsonError(413, "La conversation envoyée est trop volumineuse.");
    }
    if (error instanceof InvalidAssistantRequestError) {
      return jsonError(400, "La requête de conversation est invalide.");
    }
    if (error instanceof AssetAccessDeniedError) {
      return jsonError(404, "Maquette introuvable.");
    }
    if (error instanceof AssistantThreadAccessDeniedError) {
      return jsonError(404, "Conversation introuvable.");
    }
    if (error instanceof AssistantNotConfiguredError) {
      return jsonError(
        503,
        "Ajoutez OPENROUTER_API_KEY à l’environnement du serveur.",
      );
    }
    if (error instanceof AssistantMcpUnavailableError) {
      return jsonError(
        503,
        "Le moteur MCP IFC-Lite est indisponible. Réessayez dans un instant.",
      );
    }
    return jsonError(500, "L’assistant n’a pas pu démarrer.");
  }
}
