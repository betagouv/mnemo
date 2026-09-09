import { getRuntimeDatabase } from "@/server/database/runtime-database";
import { DrizzleProjectRepository } from "@/server/projects/infrastructure/drizzle-project-repository";
import { getRuntimeObjectStorage } from "@/server/storage/runtime-object-storage";

import { AssetService } from "./application/asset-service";
import { DrizzleAssetRepository } from "./infrastructure/drizzle-asset-repository";

export function getAssetService() {
  const database = getRuntimeDatabase();

  return new AssetService(
    new DrizzleAssetRepository(database),
    new DrizzleProjectRepository(database),
    getRuntimeObjectStorage(),
  );
}
