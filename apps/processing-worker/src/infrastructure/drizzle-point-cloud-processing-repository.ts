import { assets, type MnemoDatabase } from "@mnemo/database";
import { and, eq, ne, sql } from "drizzle-orm";

import type {
  PointCloudProcessingRepository,
  PointCloudProcessingResult,
} from "../application/process-point-cloud-asset";

export class DrizzlePointCloudProcessingRepository implements PointCloudProcessingRepository {
  constructor(private readonly database: MnemoDatabase) {}

  async findPointCloudAsset(assetId: string) {
    const [asset] = await this.database
      .select({
        id: assets.id,
        projectId: assets.projectId,
        originalFileName: assets.originalFileName,
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

  async saveResult(
    assetId: string,
    result: PointCloudProcessingResult,
    processedAt: Date,
  ) {
    const saved = await this.database.execute<{ assetId: string }>(sql`
      INSERT INTO point_cloud_processing_results (
        asset_id,
        format,
        processor,
        processor_version,
        metadata_object_key,
        hierarchy_object_key,
        octree_object_key,
        point_count,
        spacing,
        processed_at,
        created_at,
        updated_at
      )
      SELECT
        ${assetId}::uuid,
        ${result.format},
        ${result.processor},
        ${result.processorVersion},
        ${result.metadataObjectKey},
        ${result.hierarchyObjectKey},
        ${result.octreeObjectKey},
        ${result.pointCount},
        ${result.spacing},
        ${processedAt},
        ${processedAt},
        ${processedAt}
      FROM assets
      WHERE assets.id = ${assetId}::uuid AND assets.status <> 'deleting'
      ON CONFLICT (asset_id) DO UPDATE SET
        format = EXCLUDED.format,
        processor = EXCLUDED.processor,
        processor_version = EXCLUDED.processor_version,
        metadata_object_key = EXCLUDED.metadata_object_key,
        hierarchy_object_key = EXCLUDED.hierarchy_object_key,
        octree_object_key = EXCLUDED.octree_object_key,
        point_count = EXCLUDED.point_count,
        spacing = EXCLUDED.spacing,
        processed_at = EXCLUDED.processed_at,
        updated_at = EXCLUDED.updated_at
      RETURNING asset_id AS "assetId"
    `);
    return saved.rows.length > 0;
  }
}
