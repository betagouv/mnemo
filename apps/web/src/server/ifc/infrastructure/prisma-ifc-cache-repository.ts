import type { MnemoPrismaDatabase } from "@mnemo/database";

import type { IfcCacheRepository } from "../application/ifc-streaming-service";

export class PrismaIfcCacheRepository implements IfcCacheRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async save(
    assetId: string,
    cacheKey: string,
    metadata: {
      entityCount: number;
      geometryEntityCount: number;
      meshCount: number;
      cacheHit: boolean;
      processorVersion: string;
    },
  ) {
    const values = {
      processor: "ifc-lite-server",
      processor_version: metadata.processorVersion,
      cache_key: cacheKey,
      entity_count: BigInt(metadata.entityCount),
      geometry_entity_count: BigInt(metadata.geometryEntityCount),
      mesh_count: BigInt(metadata.meshCount),
      cache_hit: metadata.cacheHit,
      processed_at: new Date(),
    };
    await this.database.asset_processing_results.upsert({
      where: { asset_id: assetId },
      create: { asset_id: assetId, ...values },
      update: values,
    });
  }

  async findKey(assetId: string) {
    const row = await this.database.asset_processing_results.findUnique({
      where: { asset_id: assetId },
      select: { cache_key: true },
    });
    return row?.cache_key ?? null;
  }
}
