import { assets, type MnemoDatabase } from "@mnemo/database";
import { and, eq, ne } from "drizzle-orm";

import type { PointCloudProcessingRepository } from "../application/process-point-cloud-asset";

export class DrizzlePointCloudProcessingRepository implements PointCloudProcessingRepository {
  constructor(private readonly database: MnemoDatabase) {}

  async findPointCloudAsset(assetId: string) {
    const [asset] = await this.database
      .select({
        id: assets.id,
        originalObjectKey: assets.originalObjectKey,
        sizeBytes: assets.sizeBytes,
      })
      .from(assets)
      .where(
        and(
          eq(assets.id, assetId),
          eq(assets.kind, "point_cloud"),
          ne(assets.status, "deleting"),
        ),
      )
      .limit(1);

    return asset ?? null;
  }
}
