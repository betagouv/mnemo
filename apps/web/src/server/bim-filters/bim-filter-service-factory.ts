import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { PrismaProjectRepository } from "@/server/projects/infrastructure/prisma-project-repository";
import { BimFilterService } from "./application/bim-filter-service";
import { PrismaBimFilterRepository } from "./infrastructure/prisma-bim-filter-repository";

export function getBimFilterService() {
  const db = getRuntimePrismaDatabase();
  return new BimFilterService(
    new PrismaProjectRepository(db),
    new PrismaBimFilterRepository(db),
  );
}
