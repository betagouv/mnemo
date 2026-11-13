import {
  bimFilterSettingsSchema,
  removeBimFilterAsset,
} from "@mnemo/contracts/bim-filters";
import type { MnemoPrismaDatabase, PrismaAssetRecord } from "@mnemo/database";

import type {
  AssetForActor,
  AssetRepository,
  PendingAsset,
} from "../application/asset-repository";
import {
  membershipAccessInclude,
  toProjectAccess,
} from "@/server/projects/infrastructure/project-access";

function toAsset(row: PrismaAssetRecord): AssetForActor {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    originalFileName: row.original_file_name,
    mediaType: row.media_type,
    sizeBytes: Number(row.size_bytes),
    originalObjectKey: row.original_object_key,
    status: row.status,
    errorMessage: row.error_message,
    uploadExpiresAt: row.upload_expires_at,
    uploadedAt: row.uploaded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async listForActor(
    actorId: string,
    projectId: string,
  ): Promise<AssetForActor[]> {
    const rows = await this.database.assets.findMany({
      where: {
        project_id: projectId,
        status: { not: "deleting" },
        projects: { project_members: { some: { user_id: actorId } } },
      },
      orderBy: { created_at: "desc" },
    });
    return rows.map(toAsset);
  }

  async findForActor(actorId: string, projectId: string, assetId: string) {
    const membership = await this.database.project_members.findUnique({
      where: {
        project_id_user_id: { project_id: projectId, user_id: actorId },
      },
      include: membershipAccessInclude,
    });
    if (!membership) return undefined;
    const row = await this.database.assets.findFirst({
      where: { id: assetId, project_id: projectId },
    });
    return row
      ? { asset: toAsset(row), ...toProjectAccess(membership) }
      : undefined;
  }

  async createPending(input: PendingAsset): Promise<AssetForActor> {
    const row = await this.database.assets.create({
      data: {
        id: input.id,
        project_id: input.projectId,
        kind: input.kind,
        original_file_name: input.originalFileName,
        media_type: input.mediaType,
        size_bytes: BigInt(input.sizeBytes),
        original_object_key: input.originalObjectKey,
        status: "upload_pending",
        created_by: input.createdBy,
        upload_expires_at: input.uploadExpiresAt,
      },
    });
    return toAsset(row);
  }

  async completeUpload(assetId: string, uploadedAt: Date) {
    return this.database.$transaction(async (transaction) => {
      const pending = await transaction.assets.findUnique({
        where: { id: assetId },
        select: { kind: true },
      });
      if (!pending) throw new Error("Asset update returned no record");
      await transaction.assets.updateMany({
        where: { id: assetId, status: "upload_pending" },
        data: {
          status: pending.kind === "ifc" ? "ready" : "uploaded",
          uploaded_at: uploadedAt,
          updated_at: uploadedAt,
        },
      });
      const row = await transaction.assets.findUnique({
        where: { id: assetId },
      });
      if (!row) throw new Error("Asset update returned no record");
      if (row.kind === "point_cloud") {
        await transaction.processing_jobs.createMany({
          data: [{ asset_id: row.id, type: "process_point_cloud" }],
          skipDuplicates: true,
        });
      }
      return toAsset(row);
    });
  }

  async requestDeletion(assetId: string, requestedAt: Date) {
    await this.database.$transaction(async (transaction) => {
      const row = await transaction.assets.findUnique({
        where: { id: assetId },
        include: { point_cloud_processing_results: true },
      });
      if (!row) return;
      await transaction.$queryRaw`SELECT id FROM projects WHERE id = ${row.project_id}::uuid FOR UPDATE`;
      const filters = await transaction.project_bim_filters.findUnique({
        where: { project_id: row.project_id },
      });
      if (filters) {
        const settings = bimFilterSettingsSchema.parse(filters.settings);
        if (settings.groups.some((group) => group.assetIds.includes(assetId))) {
          await transaction.project_bim_filters.update({
            where: { project_id: row.project_id },
            data: {
              settings: removeBimFilterAsset(settings, assetId),
              version: { increment: 1 },
            },
          });
        }
      }

      await transaction.assets.update({
        where: { id: assetId },
        data: { status: "deleting", updated_at: requestedAt },
      });
      const result = row.point_cloud_processing_results;
      await transaction.deletion_jobs.createMany({
        data: [
          {
            resource_id: assetId,
            type: "delete_asset",
            object_keys: [
              row.original_object_key,
              ...(result ? [result.copc_object_key] : []),
            ],
            available_at: requestedAt,
          },
        ],
        skipDuplicates: true,
      });
    });
  }
}
