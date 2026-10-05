import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";

import { PointCloudSettingsService } from "./application/point-cloud-settings-service";
import { PrismaPointCloudSettingsRepository } from "./infrastructure/prisma-point-cloud-settings-repository";

export function getPointCloudSettingsService() {
  return new PointCloudSettingsService(
    new PrismaPointCloudSettingsRepository(getRuntimePrismaDatabase()),
  );
}
