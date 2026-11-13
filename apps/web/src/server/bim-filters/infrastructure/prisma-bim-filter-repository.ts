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
  project_id: string;
  version: number;
  settings: unknown;
}): SavedBimFilters {
  return {
    projectId: row.project_id,
    version: row.version,
    settings: bimFilterSettingsSchema.parse(row.settings),
  };
}
export class PrismaBimFilterRepository implements BimFilterRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}
  async get(projectId: string) {
    const row = await this.database.project_bim_filters.findUnique({
      where: { project_id: projectId },
    });
    return row ? toFilters(row) : null;
  }
  async save(input: SaveBimFiltersInput) {
    return this.database.$transaction(async (tx) => {
      // Serialize with asset removal so a saved document cannot restore deleted targets.
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${input.projectId}::uuid FOR UPDATE`;
      const assetIds = [
        ...new Set(input.settings.groups.flatMap((group) => group.assetIds)),
      ];
      const count = await tx.assets.count({
        where: {
          id: { in: assetIds },
          project_id: input.projectId,
          kind: "ifc",
          status: "ready",
        },
      });
      if (count !== assetIds.length) throw new BimFilterSourceError();
      const result =
        input.version === 0
          ? await tx.project_bim_filters.createMany({
              data: { project_id: input.projectId, settings: input.settings },
              skipDuplicates: true,
            })
          : await tx.project_bim_filters.updateMany({
              where: { project_id: input.projectId, version: input.version },
              data: { settings: input.settings, version: { increment: 1 } },
            });
      if (!result.count) throw new BimFilterConflictError();
      return toFilters(
        await tx.project_bim_filters.findUniqueOrThrow({
          where: { project_id: input.projectId },
        }),
      );
    });
  }
}
