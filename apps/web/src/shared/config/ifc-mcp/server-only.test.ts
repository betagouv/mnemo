import { describe, expect, it } from "vitest";

import { readIfcMcpConfiguration } from "./server-only";

describe("IFC MCP configuration", () => {
  it("stays optional when no MCP variable is provided", () => {
    expect(readIfcMcpConfiguration({})).toBeNull();
  });

  it("reads a complete server-only configuration", () => {
    expect(
      readIfcMcpConfiguration({
        IFC_MCP_URL: "http://ifc-mcp:8765",
        IFC_MCP_TOKEN: "secret",
        IFC_MCP_CACHE_DIR: "/cache",
        IFC_MCP_MODEL_DIR: "/app/models",
        IFC_MCP_MAX_SESSIONS: "3",
      }),
    ).toEqual({
      url: "http://ifc-mcp:8765/",
      token: "secret",
      cacheDirectory: "/cache",
      modelDirectory: "/app/models",
      maxSessions: 3,
    });
  });

  it("rejects a partially configured bridge", () => {
    expect(() =>
      readIfcMcpConfiguration({ IFC_MCP_URL: "http://ifc-mcp:8765" }),
    ).toThrow("incomplete");
  });
});
