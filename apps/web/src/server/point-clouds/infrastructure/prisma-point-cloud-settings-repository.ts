import type { UpdatePointCloudSettingsInput } from "@mnemo/contracts/point-clouds";
import type {
  MnemoPrismaDatabase,
  PrismaPointCloudSettingsRecord,
} from "@mnemo/database";

import type { PointCloudSettingsRepository } from "../application/point-cloud-settings-repository";
import {
  membershipAccessInclude,
  toProjectAccess,
} from "@/server/projects/infrastructure/project-access";

function toSettings(row: PrismaPointCloudSettingsRecord) {
  return {
    assetId: row.asset_id,
    transform: {
      position: [row.position_x, row.position_y, row.position_z] as [
        number,
        number,
        number,
      ],
      rotationDegrees: [row.rotation_x, row.rotation_y, row.rotation_z] as [
        number,
        number,
        number,
      ],
      scale: [row.scale_x, row.scale_y, row.scale_z] as [
        number,
        number,
        number,
      ],
    },
    sourceCrs: row.source_crs,
    targetCrs: row.target_crs,
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PrismaPointCloudSettingsRepository implements PointCloudSettingsRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async findForActor(actorId: string, projectId: string, assetId: string) {
    const membership = await this.database.project_members.findUnique({
      where: {
        project_id_user_id: { project_id: projectId, user_id: actorId },
      },
      include: membershipAccessInclude,
    });
    if (!membership) return null;

    const asset = await this.database.assets.findFirst({
      where: { id: assetId, project_id: projectId },
      include: { point_cloud_settings: true },
    });
    if (!asset) return null;
    return {
      assetId: asset.id,
      kind: asset.kind,
      ...toProjectAccess(membership),
      settings: asset.point_cloud_settings
        ? toSettings(asset.point_cloud_settings)
        : null,
    };
  }

  async save(
    actorId: string,
    input: UpdatePointCloudSettingsInput,
    updatedAt: Date,
  ) {
    const values = {
      position_x: input.transform.position[0],
      position_y: input.transform.position[1],
      position_z: input.transform.position[2],
      rotation_x: input.transform.rotationDegrees[0],
      rotation_y: input.transform.rotationDegrees[1],
      rotation_z: input.transform.rotationDegrees[2],
      scale_x: input.transform.scale[0],
      scale_y: input.transform.scale[1],
      scale_z: input.transform.scale[2],
      source_crs: input.sourceCrs || null,
      target_crs: input.targetCrs || null,
      updated_by: actorId,
      updated_at: updatedAt,
    };
    const row = await this.database.point_cloud_settings.upsert({
      where: { asset_id: input.assetId },
      create: { asset_id: input.assetId, ...values },
      update: values,
    });
    return toSettings(row);
  }
}
