import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { PrismaProjectRepository } from "@/server/projects/infrastructure/prisma-project-repository";
import { MeasurementService } from "./application/measurement-service";
import { PrismaMeasurementRepository } from "./infrastructure/prisma-measurement-repository";
export function getMeasurementService() {
  const db = getRuntimePrismaDatabase();
  return new MeasurementService(
    new PrismaProjectRepository(db),
    new PrismaMeasurementRepository(db),
  );
}
