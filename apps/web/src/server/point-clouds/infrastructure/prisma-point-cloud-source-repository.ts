import type { MnemoPrismaDatabase } from "@mnemo/database";

import type { PointCloudSourceRepository } from "../application/point-cloud-source-repository";

export class PrismaPointCloudSourceRepository implements PointCloudSourceRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async findForActor(actorId: string, projectId: string, assetId: string) {
    const row = await this.database.assets.findFirst({
      where: {
        id: assetId,
        project_id: projectId,
        kind: "point_cloud",
        projects: { project_members: { some: { user_id: actorId } } },
      },
      include: { point_cloud_processing_results: true },
    });
    if (!row || row.kind !== "point_cloud") return null;

    const result = row.point_cloud_processing_results;
    return {
      asset: {
        id: row.id,
        kind: "point_cloud" as const,
        status: row.status,
        originalFileName: row.original_file_name,
        originalObjectKey: row.original_object_key,
      },
      result:
        result?.format === "copc-v1" && result.copc_object_key
          ? {
              format: "copc-v1" as const,
              copcObjectKey: result.copc_object_key,
              pointCount: Number(result.point_count),
              spacing: result.spacing,
            }
          : null,
    };
  }
}
