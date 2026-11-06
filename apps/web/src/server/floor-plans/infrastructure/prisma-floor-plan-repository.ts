import {
  floorPlanStyleSchema,
  type SavedFloorPlan,
  type SaveFloorPlanInput,
  type DeleteFloorPlanInput,
} from "@mnemo/contracts/floor-plans";
import type { MnemoPrismaDatabase } from "@mnemo/database";
import {
  FloorPlanConflictError,
  FloorPlanSourceError,
  type FloorPlanRepository,
} from "../application/floor-plan-repository";

type Row = Awaited<
  ReturnType<MnemoPrismaDatabase["project_floor_plans"]["findMany"]>
>[number];
function toPlan(row: Row): SavedFloorPlan {
  return {
    id: row.id,
    projectId: row.project_id,
    assetId: row.asset_id,
    name: row.name,
    storeyId: row.storey_id,
    storeyName: row.storey_name,
    style: floorPlanStyleSchema.parse(row.style),
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
  };
}
export class PrismaFloorPlanRepository implements FloorPlanRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}
  async list(projectId: string) {
    return (
      await this.database.project_floor_plans.findMany({
        where: {
          project_id: projectId,
          asset: { status: "ready", kind: "ifc" },
        },
        orderBy: [{ updated_at: "desc" }, { id: "asc" }],
      })
    ).map(toPlan);
  }
  async save(input: SaveFloorPlanInput) {
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
      if (!asset) throw new FloorPlanSourceError();
      const data = {
        name: input.name,
        asset_id: input.assetId,
        storey_id: input.storeyId,
        storey_name: input.storeyName,
        style: input.style,
      };
      if (!input.target)
        return toPlan(
          await tx.project_floor_plans.create({
            data: { ...data, project_id: input.projectId },
          }),
        );
      const { count } = await tx.project_floor_plans.updateMany({
        where: {
          id: input.target.id,
          project_id: input.projectId,
          version: input.target.version,
        },
        data: { ...data, version: { increment: 1 } },
      });
      if (!count) throw new FloorPlanConflictError();
      return toPlan(
        await tx.project_floor_plans.findUniqueOrThrow({
          where: { id: input.target.id },
        }),
      );
    });
  }
  async delete(input: DeleteFloorPlanInput) {
    const { count } = await this.database.project_floor_plans.deleteMany({
      where: {
        id: input.id,
        project_id: input.projectId,
        version: input.version,
      },
    });
    if (!count) throw new FloorPlanConflictError();
  }
}
