import {
  assets,
  pointCloudProcessingResults,
  projectMembers,
  type MnemoDatabase,
} from "@mnemo/database";
import { and, eq } from "drizzle-orm";

import type { PointCloudSourceRepository } from "../application/point-cloud-source-repository";

export class DrizzlePointCloudSourceRepository implements PointCloudSourceRepository {
  constructor(private readonly database: MnemoDatabase) {}

  async findForActor(actorId: string, projectId: string, assetId: string) {
    const [record] = await this.database
      .select({
        asset: {
          id: assets.id,
          kind: assets.kind,
          status: assets.status,
          originalObjectKey: assets.originalObjectKey,
        },
        result: pointCloudProcessingResults,
      })
      .from(assets)
      .innerJoin(projectMembers, eq(projectMembers.projectId, assets.projectId))
      .leftJoin(
        pointCloudProcessingResults,
        eq(pointCloudProcessingResults.assetId, assets.id),
      )
      .where(
        and(
          eq(assets.id, assetId),
          eq(assets.projectId, projectId),
          eq(assets.kind, "point_cloud"),
          eq(projectMembers.userId, actorId),
        ),
      )
      .limit(1);

    if (!record || record.asset.kind !== "point_cloud") return null;
    return {
      asset: { ...record.asset, kind: "point_cloud" as const },
      result: record.result
        ? {
            metadataObjectKey: record.result.metadataObjectKey,
            hierarchyObjectKey: record.result.hierarchyObjectKey,
            octreeObjectKey: record.result.octreeObjectKey,
            pointCount: record.result.pointCount,
            spacing: record.result.spacing,
          }
        : null,
    };
  }
}
