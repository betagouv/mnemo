import type { MnemoPrismaDatabase } from "@mnemo/database";

import type {
  IfcProcessingRepository,
  IfcProcessingResult,
} from "../application/process-ifc-asset";

export class PrismaIfcProcessingRepository implements IfcProcessingRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async findIfcAsset(assetId: string) {
    const asset = await this.database.assets.findFirst({
      where: { id: assetId, kind: "ifc" },
      select: { id: true, original_object_key: true },
    });
    return asset
      ? { id: asset.id, originalObjectKey: asset.original_object_key }
      : null;
  }

  async saveResult(
    assetId: string,
    result: IfcProcessingResult,
    processedAt: Date,
  ) {
    const values = {
      processor: result.processor,
      processor_version: result.processorVersion,
      cache_key: result.cacheKey,
      entity_count: BigInt(result.entityCount),
      geometry_entity_count: BigInt(result.geometryEntityCount),
      mesh_count: BigInt(result.meshCount),
      cache_hit: result.cacheHit,
      processed_at: processedAt,
      updated_at: processedAt,
    };
    await this.database.asset_processing_results.upsert({
      where: { asset_id: assetId },
      create: { asset_id: assetId, ...values },
      update: values,
    });
  }
}
