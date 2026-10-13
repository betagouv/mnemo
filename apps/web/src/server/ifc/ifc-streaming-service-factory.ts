import "server-only";

import { getAssetService } from "@/server/assets/asset-service-factory";
import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { getRuntimeObjectStorage } from "@/server/storage/runtime-object-storage";

import { IfcStreamingService } from "./application/ifc-streaming-service";
import { PrismaIfcCacheRepository } from "./infrastructure/prisma-ifc-cache-repository";

export function getIfcStreamingService() {
  const serverUrl = process.env.IFC_SERVER_URL;
  const serverToken = process.env.IFC_SERVER_API_TOKEN;
  if (!serverUrl || !serverToken) {
    throw new Error(
      "IFC_SERVER_URL and IFC_SERVER_API_TOKEN are required for server-side IFC processing",
    );
  }
  return new IfcStreamingService(
    getAssetService(),
    getRuntimeObjectStorage(),
    new PrismaIfcCacheRepository(getRuntimePrismaDatabase()),
    serverUrl.replace(/\/$/, ""),
    serverToken,
  );
}
