import {
  projectMapReferenceSchema,
  type ProjectMapReference,
} from "@mnemo/contracts/map-reference";
import type { MnemoPrismaDatabase } from "@mnemo/database";

import type { MapReferenceRepository } from "../application/map-reference-service";

export class PrismaMapReferenceRepository implements MapReferenceRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async find(projectId: string) {
    const row = await this.database.project_map_references.findUnique({
      where: { project_id: projectId },
    });
    return row
      ? projectMapReferenceSchema.parse({
          ...(row.reference as object),
          assetId: row.asset_id,
        })
      : null;
  }

  async pin(
    projectId: string,
    { assetId, ...reference }: ProjectMapReference,
  ): Promise<ProjectMapReference> {
    const asset = assetId
      ? await this.database.assets.findFirst({
          where: { id: assetId, project_id: projectId, kind: "ifc" },
          select: { id: true },
        })
      : null;
    await this.database.project_map_references.createMany({
      data: {
        project_id: projectId,
        asset_id: asset?.id ?? null,
        reference,
      },
      skipDuplicates: true,
    });
    const pinned = await this.find(projectId);
    if (!pinned) throw new Error("The project map reference was not saved");
    return pinned;
  }
}
