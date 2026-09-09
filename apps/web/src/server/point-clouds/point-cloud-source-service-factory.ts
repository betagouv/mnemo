import { getRuntimeDatabase } from "@/server/database/runtime-database";
import { getRuntimeObjectStorage } from "@/server/storage/runtime-object-storage";

import { PointCloudSourceService } from "./application/point-cloud-source-service";
import { DrizzlePointCloudSourceRepository } from "./infrastructure/drizzle-point-cloud-source-repository";

export function getPointCloudSourceService() {
  return new PointCloudSourceService(
    new DrizzlePointCloudSourceRepository(getRuntimeDatabase()),
    getRuntimeObjectStorage(),
  );
}
