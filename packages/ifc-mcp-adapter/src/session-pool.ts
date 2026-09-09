import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";

export const IFC_MCP_READ_TOOL_NAMES = [
  "model_info",
  "schema_describe",
  "query_entities",
  "count_entities",
  "get_entity",
  "get_entities_bulk",
  "spatial_hierarchy",
  "containment_chain",
  "relationships",
  "properties_unique",
  "materials_list",
  "classifications_list",
  "georeferencing",
  "units",
  "geometry_bbox",
  "geometry_volume",
  "geometry_area",
] as const;

export type IfcMcpReadToolName = (typeof IFC_MCP_READ_TOOL_NAMES)[number];

export type IfcMcpConnectionOptions = {
  url: string;
  token: string;
  maxSessions?: number;
};

export type IfcMcpModel = {
  assetId: string;
  filePath: string;
};

export type IfcMcpSession = {
  modelId: string;
  tools: ToolSet;
};

type McpClientPort = Pick<
  MCPClient,
  "callTool" | "close" | "listTools" | "toolsFromDefinitions"
>;

export type McpClientFactory = () => Promise<McpClientPort>;

type PoolEntry = {
  lastUsedAt: number;
  session: Promise<IfcMcpSession & { client: McpClientPort }>;
};

export function createIfcMcpFetch(
  baseFetch: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    if ((init?.method ?? "GET").toUpperCase() === "POST") {
      // IFC-Lite 0.13 keeps an SSE response open whenever Accept contains
      // text/event-stream. The AI SDK advertises JSON + SSE together, so force
      // the server's supported single-response JSON path for our bounded tools.
      headers.set("Accept", "application/json");
    }
    return baseFetch(input, { ...init, headers });
  };
}

function errorText(result: Awaited<ReturnType<McpClientPort["callTool"]>>) {
  if (!Array.isArray(result.content)) {
    return "IFC-Lite MCP rejected the model";
  }

  for (const part of result.content) {
    if (
      typeof part === "object" &&
      part !== null &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
    ) {
      return part.text;
    }
  }

  return "IFC-Lite MCP rejected the model";
}

export class IfcLiteMcpSessionPool {
  private readonly entries = new Map<string, PoolEntry>();
  private readonly maxSessions: number;
  private readonly createClient: McpClientFactory;

  constructor(
    options: IfcMcpConnectionOptions,
    createClient: McpClientFactory = () =>
      createMCPClient({
        clientName: "mnemo",
        version: "0.1.0",
        maxRetries: 1,
        protocolVersionDiscovery: false,
        initializationOptions: { timeout: 30_000 },
        transport: {
          type: "http",
          url: options.url,
          headers: { Authorization: `Bearer ${options.token}` },
          redirect: "error",
          fetch: createIfcMcpFetch(),
        },
      }),
  ) {
    this.maxSessions = Math.max(1, options.maxSessions ?? 2);
    this.createClient = createClient;
  }

  async get(model: IfcMcpModel): Promise<IfcMcpSession> {
    const cached = this.entries.get(model.assetId);
    if (cached) {
      cached.lastUsedAt = Date.now();
      const resolved = await cached.session;
      try {
        const health = await resolved.client.callTool({
          name: "model_info",
          arguments: { model_id: model.assetId },
          options: { timeout: 10_000 },
        });
        if (health.isError) throw new Error(errorText(health));
        return { modelId: resolved.modelId, tools: resolved.tools };
      } catch {
        await this.dispose(model.assetId);
        return this.get(model);
      }
    }

    await this.evictIfNeeded();
    const entry: PoolEntry = {
      lastUsedAt: Date.now(),
      session: this.open(model),
    };
    this.entries.set(model.assetId, entry);

    try {
      const session = await entry.session;
      return { modelId: session.modelId, tools: session.tools };
    } catch (error) {
      this.entries.delete(model.assetId);
      throw error;
    }
  }

  async dispose(assetId: string) {
    const entry = this.entries.get(assetId);
    if (!entry) return;

    this.entries.delete(assetId);
    const session = await entry.session.catch(() => null);
    await session?.client.close().catch(() => undefined);
  }

  async close() {
    const assetIds = [...this.entries.keys()];
    await Promise.all(assetIds.map((assetId) => this.dispose(assetId)));
  }

  private async open(model: IfcMcpModel) {
    const client = await this.createClient();

    try {
      const loadResult = await client.callTool({
        name: "model_load",
        arguments: {
          file_path: model.filePath,
          model_id: model.assetId,
        },
        options: { timeout: 15 * 60 * 1_000 },
      });
      if (loadResult.isError) {
        throw new Error(errorText(loadResult));
      }

      const definitions = await client.listTools();
      const allowed = new Set<string>(IFC_MCP_READ_TOOL_NAMES);
      const safeDefinitions = {
        ...definitions,
        tools: definitions.tools.filter((tool) => allowed.has(tool.name)),
      };
      const tools = client.toolsFromDefinitions(safeDefinitions) as ToolSet;

      return { client, modelId: model.assetId, tools };
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    }
  }

  private async evictIfNeeded() {
    if (this.entries.size < this.maxSessions) return;

    const oldest = [...this.entries.entries()].sort(
      ([, left], [, right]) => left.lastUsedAt - right.lastUsedAt,
    )[0];
    if (oldest) await this.dispose(oldest[0]);
  }
}
