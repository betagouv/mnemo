import type {
  PointCloudSettings,
  UpdatePointCloudSettingsInput,
} from "@mnemo/contracts/point-clouds";
import {
  assets,
  pointCloudSettings,
  projectMembers,
  type MnemoDatabase,
} from "@mnemo/database";
import { and, eq } from "drizzle-orm";

import type { PointCloudSettingsRepository } from "../application/point-cloud-settings-repository";

function toSettings(
  row: typeof pointCloudSettings.$inferSelect,
): PointCloudSettings {
  return {
    assetId: row.assetId,
    transform: {
      position: [row.positionX, row.positionY, row.positionZ],
      rotationDegrees: [row.rotationX, row.rotationY, row.rotationZ],
      scale: [row.scaleX, row.scaleY, row.scaleZ],
    },
    sourceCrs: row.sourceCrs,
    targetCrs: row.targetCrs,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class DrizzlePointCloudSettingsRepository implements PointCloudSettingsRepository {
  constructor(private readonly database: MnemoDatabase) {}

  async findForActor(actorId: string, projectId: string, assetId: string) {
    const [match] = await this.database
      .select({
        assetId: assets.id,
        kind: assets.kind,
        role: projectMembers.role,
        settings: pointCloudSettings,
      })
      .from(assets)
      .innerJoin(projectMembers, eq(projectMembers.projectId, assets.projectId))
      .leftJoin(pointCloudSettings, eq(pointCloudSettings.assetId, assets.id))
      .where(
        and(
          eq(assets.id, assetId),
          eq(assets.projectId, projectId),
          eq(projectMembers.userId, actorId),
        ),
      )
      .limit(1);

    if (!match) return null;
    return {
      assetId: match.assetId,
      kind: match.kind,
      role: match.role,
      settings: match.settings ? toSettings(match.settings) : null,
    };
  }

  async save(
    actorId: string,
    input: UpdatePointCloudSettingsInput,
    updatedAt: Date,
  ): Promise<PointCloudSettings> {
    const values = {
      assetId: input.assetId,
      positionX: input.transform.position[0],
      positionY: input.transform.position[1],
      positionZ: input.transform.position[2],
      rotationX: input.transform.rotationDegrees[0],
      rotationY: input.transform.rotationDegrees[1],
      rotationZ: input.transform.rotationDegrees[2],
      scaleX: input.transform.scale[0],
      scaleY: input.transform.scale[1],
      scaleZ: input.transform.scale[2],
      sourceCrs: input.sourceCrs || null,
      targetCrs: input.targetCrs || null,
      updatedBy: actorId,
      updatedAt,
    };
    const [saved] = await this.database
      .insert(pointCloudSettings)
      .values(values)
      .onConflictDoUpdate({
        target: pointCloudSettings.assetId,
        set: values,
      })
      .returning();

    if (!saved) throw new Error("Point-cloud settings upsert returned no row");
    return toSettings(saved);
  }
}
