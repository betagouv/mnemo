import {
  measurementPointsSchema,
  type SavedMeasurement,
  type SaveMeasurementInput,
  type DeleteMeasurementInput,
} from "@mnemo/contracts/measurements";
import { Prisma, type MnemoPrismaDatabase } from "@mnemo/database";
import {
  MeasurementConflictError,
  MeasurementPlanError,
  type MeasurementRepository,
} from "../application/measurement-repository";
type Row = Awaited<
  ReturnType<MnemoPrismaDatabase["project_measurements"]["findMany"]>
>[number];
function toMeasurement(row: Row): SavedMeasurement {
  return {
    id: row.id,
    projectId: row.project_id,
    floorPlanId: row.floor_plan_id,
    createdBy: row.created_by,
    name: row.name,
    kind: row.kind,
    points: measurementPointsSchema.parse(row.points),
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
  };
}
export class PrismaMeasurementRepository implements MeasurementRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}
  async list(projectId: string) {
    return (
      await this.database.project_measurements.findMany({
        where: { project_id: projectId },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
      })
    ).map(toMeasurement);
  }
  async save(actorId: string, input: SaveMeasurementInput) {
    try {
      return await this.database.$transaction(async (tx) => {
        if (input.floorPlanId) {
          const plans = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT p.id FROM project_floor_plans p
            JOIN assets a ON a.id=p.asset_id
            WHERE p.id=${input.floorPlanId}::uuid AND p.project_id=${input.projectId}::uuid AND a.status='ready'
            FOR SHARE OF p
          `);
          if (!plans.length) throw new MeasurementPlanError();
        }
        const data = {
          name: input.name,
          kind: input.kind,
          points: input.points,
          floor_plan_id: input.floorPlanId,
        };
        if (input.version === undefined) {
          // Repeated saves with the same client UUID must not create duplicates.
          const existing = await tx.project_measurements.findUnique({
            where: { id: input.id },
          });
          if (existing) {
            if (
              existing.project_id === input.projectId &&
              existing.created_by === actorId &&
              existing.version === 1 &&
              existing.name === input.name &&
              existing.kind === input.kind &&
              existing.floor_plan_id === input.floorPlanId &&
              JSON.stringify(measurementPointsSchema.parse(existing.points)) ===
                JSON.stringify(input.points)
            )
              return toMeasurement(existing);
            throw new MeasurementConflictError();
          }
          return toMeasurement(
            await tx.project_measurements.create({
              data: {
                ...data,
                id: input.id,
                project_id: input.projectId,
                created_by: actorId,
              },
            }),
          );
        }
        const { count } = await tx.project_measurements.updateMany({
          where: {
            id: input.id,
            project_id: input.projectId,
            version: input.version,
          },
          data: { ...data, version: { increment: 1 } },
        });
        if (!count) throw new MeasurementConflictError();
        return toMeasurement(
          await tx.project_measurements.findUniqueOrThrow({
            where: { id: input.id },
          }),
        );
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new MeasurementConflictError();
      throw error;
    }
  }
  async delete(input: DeleteMeasurementInput) {
    const { count } = await this.database.project_measurements.deleteMany({
      where: {
        id: input.id,
        project_id: input.projectId,
        version: input.version,
      },
    });
    if (!count) throw new MeasurementConflictError();
  }
}
