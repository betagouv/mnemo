import {
  BearerTokenAuth,
  HttpTransport,
  InMemoryModelRegistry,
  SILENT_LOGGER,
  ToolRegistry,
  VERSION,
  buildDefaultToolRegistry,
  createMCPServer,
  fullScope,
} from "@ifc-lite/mcp";

const SAFE_READ_TOOLS = new Set([
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
]);

// model_load needs the MCP "mutate" scope, but it is the only non-read tool
// registered by this runtime. Paths still have to live under /app/models.
const RUNTIME_TOOLS = new Set(["model_load", ...SAFE_READ_TOOLS]);

function createRuntimeToolRegistry() {
  const tools = new ToolRegistry();
  tools.registerAll(
    buildDefaultToolRegistry()
      .list()
      .filter((tool) => RUNTIME_TOOLS.has(tool.name)),
  );

  const registeredNames = new Set(tools.list().map((tool) => tool.name));
  for (const requiredName of RUNTIME_TOOLS) {
    if (!registeredNames.has(requiredName)) {
      throw new Error(`Required IFC-Lite MCP tool is missing: ${requiredName}`);
    }
  }

  return tools;
}

const token = process.env.IFC_MCP_TOKEN?.trim();
if (!token) {
  throw new Error("IFC_MCP_TOKEN is required");
}

const port = Number.parseInt(process.env.IFC_MCP_PORT ?? "8765", 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("IFC_MCP_PORT must be a valid TCP port");
}

const scope = fullScope();
const transport = new HttpTransport({
  port,
  host: "0.0.0.0",
  authenticator: new BearerTokenAuth(new Map([[token, scope]])),
  sessionFactory: {
    build(sessionScope, sessionId) {
      return createMCPServer({
        version: VERSION,
        registry: new InMemoryModelRegistry(),
        scope: sessionScope,
        sessionId,
        tools: createRuntimeToolRegistry(),
        logger: SILENT_LOGGER,
        config: {
          readOnly: false,
          allowedPaths: ["/app/models"],
          samplingEnabled: false,
          autoOpenViewer: false,
        },
      });
    },
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void transport.close().finally(() => process.exit(0));
  });
}

await transport.listen();
console.info(
  `IFC-Lite MCP listening on port ${port} with ${RUNTIME_TOOLS.size} controlled tools`,
);
