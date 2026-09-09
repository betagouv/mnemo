import { getRuntimeDatabase } from "@/server/database/runtime-database";

import { PointCloudSettingsService } from "./application/point-cloud-settings-service";
import { DrizzlePointCloudSettingsRepository } from "./infrastructure/drizzle-point-cloud-settings-repository";

export function getPointCloudSettingsService() {
  return new PointCloudSettingsService(
    new DrizzlePointCloudSettingsRepository(getRuntimeDatabase()),
  );
}
