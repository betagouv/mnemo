import type { FrontendTools } from "@assistant-ui/ai-sdk";
import { assetIdSchema, type OpenAssetResult } from "@mnemo/contracts/assets";
import { projectIdSchema } from "@mnemo/contracts/projects";
import { safeValidateUIMessages, type UIMessage } from "ai";
import { z } from "zod";

import { getAssetService } from "@/server/assets/asset-service-factory";
import { AssetAccessDeniedError } from "@/server/assets/application/asset-errors";
import { resolveActor } from "@/server/auth/resolve-actor";
import { getAssistantConfiguration } from "@/shared/config/assistant/server-only";

import { streamAssistantChat } from "../application/assistant-chat";

const maxRequestBytes = 1 * 1_024 * 1_024;
const maxMessages = 100;
const maxFrontendTools = 32;

const requestEnvelopeSchema = z.looseObject({
  assetId: assetIdSchema,
  messages: z.array(z.unknown()).max(maxMessages),
  tools: z.record(z.string().min(1).max(80), z.unknown()).optional(),
});

export class InvalidAssistantRequestError extends Error {}
export class AssistantRequestTooLargeError extends Error {}
export class AssistantNotConfiguredError extends Error {}

type ValidatedAssistantRequest = {
  assetId: string;
  messages: UIMessage[];
  tools: FrontendTools;
};

export type AssistantHttpDependencies = {
  authorize: (
    actorId: string,
    input: { projectId: string; assetId: string },
  ) => Promise<OpenAssetResult>;
  resolveActorId: () => string;
  stream: (input: ValidatedAssistantRequest) => Response | Promise<Response>;
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
    messages: validatedMessages.data,
    tools: validateFrontendTools(envelope.data.tools),
  };
}

function jsonError(status: number, error: string) {
  return Response.json({ error }, { status });
}

const defaultDependencies: AssistantHttpDependencies = {
  authorize: (actorId, input) => getAssetService().open(actorId, input),
  resolveActorId: () => resolveActor().id,
  stream: (input) => {
    let configuration;
    try {
      configuration = getAssistantConfiguration();
    } catch {
      throw new AssistantNotConfiguredError(
        "OPENROUTER_API_KEY is not configured",
      );
    }
    return streamAssistantChat({ configuration, ...input });
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
    const access = await dependencies.authorize(dependencies.resolveActorId(), {
      projectId: projectId.data,
      assetId: input.assetId,
    });
    if (access.asset.kind !== "ifc") {
      return jsonError(400, "L’assistant doit être lié à une maquette IFC.");
    }
    return await dependencies.stream(input);
  } catch (error) {
    if (error instanceof AssistantRequestTooLargeError) {
      return jsonError(413, "La conversation envoyée est trop volumineuse.");
    }
    if (error instanceof InvalidAssistantRequestError) {
      return jsonError(400, "La requête de conversation est invalide.");
    }
    if (error instanceof AssetAccessDeniedError) {
      return jsonError(404, "Maquette introuvable.");
    }
    if (error instanceof AssistantNotConfiguredError) {
      return jsonError(
        503,
        "Ajoutez OPENROUTER_API_KEY à l’environnement du serveur.",
      );
    }
    return jsonError(500, "L’assistant n’a pas pu démarrer.");
  }
}
