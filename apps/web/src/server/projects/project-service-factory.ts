import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";

import { ProjectService } from "./application/project-service";
import { PrismaProjectRepository } from "./infrastructure/prisma-project-repository";

export function getProjectService() {
  return new ProjectService(
    new PrismaProjectRepository(getRuntimePrismaDatabase()),
  );
}
