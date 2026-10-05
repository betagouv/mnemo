import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { PrismaProjectRepository } from "@/server/projects/infrastructure/prisma-project-repository";
import { getRuntimeObjectStorage } from "@/server/storage/runtime-object-storage";

import { AssetService } from "./application/asset-service";
import { PrismaAssetRepository } from "./infrastructure/prisma-asset-repository";

export function getAssetService() {
  const database = getRuntimePrismaDatabase();

  return new AssetService(
    new PrismaAssetRepository(database),
    new PrismaProjectRepository(database),
    getRuntimeObjectStorage(),
  );
}
