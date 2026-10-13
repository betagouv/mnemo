import { Prisma, type MnemoPrismaDatabase } from "@mnemo/database";

import type {
  PointCloudProcessingRepository,
  PointCloudProcessingResult,
} from "../application/process-point-cloud-asset";

export class PrismaPointCloudProcessingRepository implements PointCloudProcessingRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async findPointCloudAsset(assetId: string) {
    const asset = await this.database.assets.findFirst({
      where: { id: assetId, kind: "point_cloud", status: { not: "deleting" } },
      select: {
        id: true,
        project_id: true,
        original_file_name: true,
        original_object_key: true,
        size_bytes: true,
      },
    });
    return asset
      ? {
          id: asset.id,
          projectId: asset.project_id,
          originalFileName: asset.original_file_name,
          originalObjectKey: asset.original_object_key,
          sizeBytes: Number(asset.size_bytes),
        }
      : null;
  }

  async saveResult(
    assetId: string,
    result: PointCloudProcessingResult,
    processedAt: Date,
    lease?: { jobId: string; attempt: number; workerId: string },
  ) {
    // Keep this conditional upsert atomic with asset deletion. Prisma's model
    // upsert cannot express the INSERT ... SELECT guard against deleting assets.
    const rows = await this.database.$queryRaw<
      Array<{ assetId: string }>
    >(Prisma.sql`
      INSERT INTO point_cloud_processing_results (
        asset_id, format, processor, processor_version, metadata_object_key,
        hierarchy_object_key, octree_object_key, point_count, spacing,
        processed_at, created_at, updated_at
      )
      SELECT
        ${assetId}::uuid, ${result.format}, ${result.processor},
        ${result.processorVersion}, ${result.metadataObjectKey},
        ${result.hierarchyObjectKey}, ${result.octreeObjectKey},
        ${result.pointCount}, ${result.spacing}, ${processedAt},
        ${processedAt}, ${processedAt}
      FROM assets
      WHERE assets.id = ${assetId}::uuid AND assets.status <> 'deleting'
        AND (${lease?.jobId ?? null}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM processing_jobs AS job
          WHERE job.id = ${lease?.jobId ?? null}::uuid
            AND job.asset_id = assets.id
            AND job.type = 'process_point_cloud'
            AND job.status = 'running'
            AND job.attempts = ${lease?.attempt ?? null}
            AND job.locked_by = ${lease?.workerId ?? null}
        ))
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
    return rows.length > 0;
  }
}
