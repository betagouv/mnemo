import { describe, expect, it, vi } from "vitest";
import {
  AssistantNotConfiguredError,
  AssistantMcpUnavailableError,
} from "./assistant-session-errors";
import {
  startAssistantSession,
  type AssistantSessionDependencies,
  type AssistantSessionInput,
} from "./start-assistant-session";

const stream = vi.hoisted(() => vi.fn());
vi.mock("./assistant-chat", () => ({ streamAssistantChat: stream }));
const input: AssistantSessionInput = {
  actorId: "actor",
  projectId: "project",
  assetId: "asset",
  threadId: "thread",
  messages: [],
  tools: {},
  source: { assetId: "asset", objectKey: "source.ifc", sizeBytes: 42 },
};
function dependencies(): AssistantSessionDependencies {
  return {
    configuration: () => ({
      apiKey: "local-test",
      model: "test-model",
      appUrl: undefined,
    }),
    openModelTools: vi.fn(async () => ({ tools: {} })),
    persistMessages: vi.fn(async () => undefined),
  };
}
describe("assistant session orchestration", () => {
  it("checks configuration before opening model tools", async () => {
    const deps = dependencies();
    deps.configuration = () => {
      throw new Error("missing");
    };
    await expect(startAssistantSession(input, deps)).rejects.toBeInstanceOf(
      AssistantNotConfiguredError,
    );
    expect(deps.openModelTools).not.toHaveBeenCalled();
  });
  it("reports unavailable MCP without starting the AI stream", async () => {
    stream.mockClear();
    const deps = dependencies();
    deps.openModelTools = vi.fn(async () => {
      throw new Error("unavailable");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(startAssistantSession(input, deps)).rejects.toBeInstanceOf(
        AssistantMcpUnavailableError,
      );
      expect(stream).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
  it("wires model tools and durable message persistence into the stream", async () => {
    stream.mockResolvedValue(new Response("stream"));
    const deps = dependencies();
    await startAssistantSession(input, deps);
    expect(deps.openModelTools).toHaveBeenCalledWith(input.source);
    const options = stream.mock.calls.at(-1)![0];
    const messages = [
      {
        id: "message",
        role: "user",
        parts: [{ type: "text", text: "Bonjour" }],
      },
    ];
    await options.persistMessages(messages);
    expect(deps.persistMessages).toHaveBeenCalledWith("actor", {
      projectId: "project",
      assetId: "asset",
      threadId: "thread",
      messages,
    });
  });
});
