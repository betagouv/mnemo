import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { PrismaProjectRepository } from "@/server/projects/infrastructure/prisma-project-repository";

import { ProjectAccessService } from "./application/project-access-service";
import { PrismaProjectAccessRepository } from "./infrastructure/prisma-project-access-repository";

export function getProjectAccessService() {
  const database = getRuntimePrismaDatabase();
  return new ProjectAccessService(
    new PrismaProjectRepository(database),
    new PrismaProjectAccessRepository(database),
  );
}
