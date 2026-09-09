import "server-only";

export type IfcMcpConfiguration = {
  url: string;
  token: string;
  cacheDirectory: string;
  modelDirectory: string;
  maxSessions: number;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function readIfcMcpConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): IfcMcpConfiguration | null {
  const rawUrl = environment.IFC_MCP_URL?.trim();
  const token = environment.IFC_MCP_TOKEN?.trim();
  const cacheDirectory = environment.IFC_MCP_CACHE_DIR?.trim();
  const modelDirectory = environment.IFC_MCP_MODEL_DIR?.trim();

  if (!rawUrl && !token && !cacheDirectory && !modelDirectory) return null;
  if (!rawUrl || !token || !cacheDirectory || !modelDirectory) {
    throw new Error("IFC MCP configuration is incomplete");
  }

  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("IFC_MCP_URL must use HTTP or HTTPS");
  }
  const maxSessions = positiveInteger(environment.IFC_MCP_MAX_SESSIONS, 2);
  if (!maxSessions) throw new Error("IFC_MCP_MAX_SESSIONS must be positive");

  return {
    url: url.toString(),
    token,
    cacheDirectory,
    modelDirectory,
    maxSessions,
  };
}

export function getIfcMcpConfiguration() {
  const configuration = readIfcMcpConfiguration(process.env);
  if (!configuration) throw new Error("IFC MCP is not configured");
  return configuration;
}

export function isIfcMcpConfigured() {
  try {
    return readIfcMcpConfiguration(process.env) !== null;
  } catch {
    return false;
  }
}
