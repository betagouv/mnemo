import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { PrismaProjectRepository } from "@/server/projects/infrastructure/prisma-project-repository";
import { FloorPlanService } from "./application/floor-plan-service";
import { PrismaFloorPlanRepository } from "./infrastructure/prisma-floor-plan-repository";
export function getFloorPlanService() {
  const db = getRuntimePrismaDatabase();
  return new FloorPlanService(
    new PrismaProjectRepository(db),
    new PrismaFloorPlanRepository(db),
  );
}
