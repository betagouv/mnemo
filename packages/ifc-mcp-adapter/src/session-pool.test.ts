import type { MCPClient } from "@ai-sdk/mcp";
import { describe, expect, it, vi } from "vitest";

import {
  createIfcMcpFetch,
  IfcLiteMcpSessionPool,
  type McpClientFactory,
} from "./session-pool";

function clientFactory() {
  const callTool = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "Loaded" }],
    isError: false,
  });
  const close = vi.fn().mockResolvedValue(undefined);
  const listTools = vi.fn().mockResolvedValue({
    tools: [
      { name: "model_info", inputSchema: { type: "object" } },
      { name: "query_entities", inputSchema: { type: "object" } },
      { name: "entity_delete", inputSchema: { type: "object" } },
      { name: "viewer_open", inputSchema: { type: "object" } },
    ],
  });
  const toolsFromDefinitions = vi.fn(
    (definitions: { tools: Array<{ name: string }> }) =>
      Object.fromEntries(
        definitions.tools.map(({ name }) => [
          name,
          { inputSchema: {}, execute: vi.fn() },
        ]),
      ),
  );
  const client = {
    callTool,
    close,
    listTools,
    toolsFromDefinitions,
  } as unknown as Pick<
    MCPClient,
    "callTool" | "close" | "listTools" | "toolsFromDefinitions"
  >;
  const factory = vi.fn().mockResolvedValue(client) as McpClientFactory;

  return { callTool, close, factory };
}

describe("IfcLiteMcpSessionPool", () => {
  it("forces IFC-Lite HTTP calls onto its finite JSON response path", async () => {
    let received: RequestInit | undefined;
    const baseFetch: typeof globalThis.fetch = async (_input, init) => {
      received = init;
      return new Response("{}");
    };
    const fetch = createIfcMcpFetch(baseFetch);

    await fetch("http://ifc-mcp.local", {
      method: "POST",
      headers: { Accept: "application/json, text/event-stream" },
    });

    expect(new Headers(received?.headers).get("accept")).toBe(
      "application/json",
    );
  });

  it("loads one controlled model and exposes only allowlisted read tools", async () => {
    const mock = clientFactory();
    const pool = new IfcLiteMcpSessionPool(
      { url: "http://ifc-mcp.local", token: "secret" },
      mock.factory,
    );

    const session = await pool.get({
      assetId: "asset-id",
      filePath: "/app/models/asset-id.ifc",
    });

    expect(mock.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "model_load",
        arguments: {
          file_path: "/app/models/asset-id.ifc",
          model_id: "asset-id",
        },
      }),
    );
    expect(Object.keys(session.tools)).toEqual([
      "model_info",
      "query_entities",
    ]);
    expect(session.tools).not.toHaveProperty("entity_delete");
    expect(session.tools).not.toHaveProperty("viewer_open");
  });

  it("reuses a live session and evicts the least-recently-used model", async () => {
    const mock = clientFactory();
    const pool = new IfcLiteMcpSessionPool(
      { url: "http://ifc-mcp.local", token: "secret", maxSessions: 1 },
      mock.factory,
    );

    await pool.get({ assetId: "one", filePath: "/app/models/one.ifc" });
    await pool.get({ assetId: "one", filePath: "/app/models/one.ifc" });
    expect(mock.factory).toHaveBeenCalledTimes(1);

    await pool.get({ assetId: "two", filePath: "/app/models/two.ifc" });
    expect(mock.factory).toHaveBeenCalledTimes(2);
    expect(mock.close).toHaveBeenCalledTimes(1);
  });

  it("closes and forgets a session whose model cannot be loaded", async () => {
    const mock = clientFactory();
    mock.callTool.mockResolvedValueOnce({
      content: [{ type: "text", text: "Path denied" }],
      isError: true,
    });
    const pool = new IfcLiteMcpSessionPool(
      { url: "http://ifc-mcp.local", token: "secret" },
      mock.factory,
    );

    await expect(
      pool.get({ assetId: "asset-id", filePath: "/forbidden.ifc" }),
    ).rejects.toThrow("Path denied");
    expect(mock.close).toHaveBeenCalledOnce();
  });
});
