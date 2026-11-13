import {
  bimFilterSettingsSchema,
  type SaveBimFiltersInput,
  type SavedBimFilters,
} from "@mnemo/contracts/bim-filters";
import type { MnemoPrismaDatabase } from "@mnemo/database";
import {
  BimFilterConflictError,
  BimFilterSourceError,
  type BimFilterRepository,
} from "../application/bim-filter-repository";

function toFilters(row: {
  asset_id: string;
  version: number;
  settings: unknown;
}): SavedBimFilters {
  return {
    assetId: row.asset_id,
    version: row.version,
    settings: bimFilterSettingsSchema.parse(row.settings),
  };
}
export class PrismaBimFilterRepository implements BimFilterRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}
  async list(projectId: string) {
    const rows = await this.database.model_bim_filters.findMany({
      where: { asset: { project_id: projectId, kind: "ifc", status: "ready" } },
      orderBy: { asset_id: "asc" },
    });
    return rows.map(toFilters);
  }
  async save(input: SaveBimFiltersInput) {
    return this.database.$transaction(async (tx) => {
      const asset = await tx.assets.findFirst({
        where: {
          id: input.assetId,
          project_id: input.projectId,
          kind: "ifc",
          status: "ready",
        },
        select: { id: true },
      });
      if (!asset) throw new BimFilterSourceError();
      const result =
        input.version === 0
          ? await tx.model_bim_filters.createMany({
              data: { asset_id: input.assetId, settings: input.settings },
              skipDuplicates: true,
            })
          : await tx.model_bim_filters.updateMany({
              where: { asset_id: input.assetId, version: input.version },
              data: { settings: input.settings, version: { increment: 1 } },
            });
      if (!result.count) throw new BimFilterConflictError();
      return toFilters(
        await tx.model_bim_filters.findUniqueOrThrow({
          where: { asset_id: input.assetId },
        }),
      );
    });
  }
}
