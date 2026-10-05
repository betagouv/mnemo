import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { getRuntimeObjectStorage } from "@/server/storage/runtime-object-storage";

import { PointCloudSourceService } from "./application/point-cloud-source-service";
import { PrismaPointCloudSourceRepository } from "./infrastructure/prisma-point-cloud-source-repository";

export function getPointCloudSourceService() {
  return new PointCloudSourceService(
    new PrismaPointCloudSourceRepository(getRuntimePrismaDatabase()),
    getRuntimeObjectStorage(),
  );
}
