import { describe, expect, it, vi } from "vitest";

import { AssistantThreadAccessDeniedError } from "../application/assistant-thread-errors";

import {
  AssistantRequestTooLargeError,
  handleAssistantHttpRequest,
  parseAssistantRequest,
  type AuthorizedAssistantAsset,
  type AssistantHttpDependencies,
} from "./assistant-http";

const projectId = "00000000-0000-4000-8000-000000000010";
const assetId = "00000000-0000-4000-8000-000000000020";
const threadId = "00000000-0000-4000-8000-000000000030";

function ifcAccess(): AuthorizedAssistantAsset {
  return {
    id: assetId,
    kind: "ifc",
    sizeBytes: 120,
    originalObjectKey: `projects/${projectId}/assets/${assetId}/original.ifc`,
    status: "ready",
  };
}

function validRequest(body: Record<string, unknown> = {}) {
  return new Request(`http://localhost/api/projects/${projectId}/assistant`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      assetId,
      threadId,
      messages: [
        {
          id: "message-1",
          role: "user",
          parts: [{ type: "text", text: "Montre les murs" }],
        },
      ],
      tools: {
        inspect_scene: {
          description: "Inspect the scene",
          parameters: { type: "object", properties: {} },
        },
      },
      ...body,
    }),
  });
}

function dependencies(
  overrides: Partial<AssistantHttpDependencies> = {},
): AssistantHttpDependencies {
  return {
    authorize: vi.fn().mockResolvedValue(ifcAccess()),
    resolveActorId: () => "00000000-0000-4000-8000-000000000001",
    requireThread: vi.fn().mockResolvedValue({ id: threadId }),
    stream: vi.fn(() => new Response("stream", { status: 200 })),
    ...overrides,
  };
}

describe("assistant HTTP transport", () => {
  it("validates messages and forwards only bounded frontend tools", async () => {
    const deps = dependencies();

    const response = await handleAssistantHttpRequest(
      validRequest(),
      projectId,
      deps,
    );

    expect(response.status).toBe(200);
    expect(deps.authorize).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      { projectId, assetId },
    );
    expect(deps.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId,
        threadId,
        projectId,
        messages: [expect.objectContaining({ role: "user" })],
        tools: { inspect_scene: expect.any(Object) },
        source: {
          assetId,
          objectKey: `projects/${projectId}/assets/${assetId}/original.ifc`,
          sizeBytes: 120,
        },
      }),
    );
  });

  it("rejects malformed messages before authorization", async () => {
    const deps = dependencies();
    const response = await handleAssistantHttpRequest(
      validRequest({ messages: [{ role: "user", parts: "invalid" }] }),
      projectId,
      deps,
    );

    expect(response.status).toBe(400);
    expect(deps.authorize).not.toHaveBeenCalled();
  });

  it("rejects a request that exceeds the byte limit even with a false length", async () => {
    const oversized = new Uint8Array(1_024 * 1_024 + 1);
    const request = new Request("http://localhost/assistant", {
      method: "POST",
      headers: { "content-length": "10" },
      body: oversized,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(parseAssistantRequest(request)).rejects.toBeInstanceOf(
      AssistantRequestTooLargeError,
    );
  });

  it("requires an IFC asset", async () => {
    const access = ifcAccess();
    access.kind = "point_cloud";
    const response = await handleAssistantHttpRequest(
      validRequest(),
      projectId,
      dependencies({ authorize: vi.fn().mockResolvedValue(access) }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "L’assistant doit être lié à une maquette IFC.",
    });
  });

  it("rejects a thread outside the authorized IFC context", async () => {
    const deps = dependencies({
      requireThread: vi
        .fn()
        .mockRejectedValue(new AssistantThreadAccessDeniedError()),
    });

    const response = await handleAssistantHttpRequest(
      validRequest(),
      projectId,
      deps,
    );

    expect(response.status).toBe(404);
    expect(deps.stream).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Conversation introuvable.",
    });
  });
});
