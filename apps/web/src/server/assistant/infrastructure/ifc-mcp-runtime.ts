import "server-only";

import { IfcLiteMcpSessionPool } from "@mnemo/ifc-mcp-adapter";

import { getRuntimeObjectStorage } from "@/server/storage/runtime-object-storage";
import { getIfcMcpConfiguration } from "@/shared/config/ifc-mcp/server-only";

import {
  LocalIfcMcpModelCache,
  type IfcMcpCacheSource,
} from "./local-ifc-mcp-model-cache";

type IfcMcpRuntime = {
  cache: LocalIfcMcpModelCache;
  sessions: IfcLiteMcpSessionPool;
};

const runtimeGlobal = globalThis as typeof globalThis & {
  mnemoIfcMcpRuntime?: IfcMcpRuntime;
};

function getIfcMcpRuntime(): IfcMcpRuntime {
  if (runtimeGlobal.mnemoIfcMcpRuntime) return runtimeGlobal.mnemoIfcMcpRuntime;

  const configuration = getIfcMcpConfiguration();
  const runtime = {
    cache: new LocalIfcMcpModelCache(getRuntimeObjectStorage(), {
      cacheDirectory: configuration.cacheDirectory,
      mcpModelDirectory: configuration.modelDirectory,
    }),
    sessions: new IfcLiteMcpSessionPool({
      url: configuration.url,
      token: configuration.token,
      maxSessions: configuration.maxSessions,
    }),
  };
  runtimeGlobal.mnemoIfcMcpRuntime = runtime;
  return runtime;
}

export async function getIfcMcpTools(source: IfcMcpCacheSource) {
  const runtime = getIfcMcpRuntime();
  const filePath = await runtime.cache.ensure(source);
  return runtime.sessions.get({ assetId: source.assetId, filePath });
}

export async function disposeIfcMcpAsset(assetId: string) {
  const runtime = runtimeGlobal.mnemoIfcMcpRuntime;
  if (!runtime) return;
  await runtime.sessions.dispose(assetId);
  await runtime.cache.remove(assetId);
}
