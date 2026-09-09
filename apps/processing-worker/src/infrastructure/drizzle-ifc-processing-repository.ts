import {
  assetProcessingResults,
  assets,
  type MnemoDatabase,
} from "@mnemo/database";
import { and, eq } from "drizzle-orm";

import type {
  IfcProcessingRepository,
  IfcProcessingResult,
} from "../application/process-ifc-asset";

export class DrizzleIfcProcessingRepository implements IfcProcessingRepository {
  constructor(private readonly database: MnemoDatabase) {}

  async findIfcAsset(assetId: string) {
    const [asset] = await this.database
      .select({
        id: assets.id,
        originalObjectKey: assets.originalObjectKey,
      })
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.kind, "ifc")))
      .limit(1);

    return asset ?? null;
  }

  async saveResult(
    assetId: string,
    result: IfcProcessingResult,
    processedAt: Date,
  ) {
    const values = {
      assetId,
      ...result,
      processedAt,
      updatedAt: processedAt,
    };

    await this.database
      .insert(assetProcessingResults)
      .values(values)
      .onConflictDoUpdate({
        target: assetProcessingResults.assetId,
        set: {
          processor: result.processor,
          processorVersion: result.processorVersion,
          cacheKey: result.cacheKey,
          entityCount: result.entityCount,
          geometryEntityCount: result.geometryEntityCount,
          meshCount: result.meshCount,
          cacheHit: result.cacheHit,
          processedAt,
          updatedAt: processedAt,
        },
      });
  }
}
