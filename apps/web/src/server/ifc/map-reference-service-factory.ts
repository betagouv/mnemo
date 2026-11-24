import "server-only";

import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { PrismaProjectRepository } from "@/server/projects/infrastructure/prisma-project-repository";

import { MapReferenceService } from "./application/map-reference-service";
import { PrismaMapReferenceRepository } from "./infrastructure/prisma-map-reference-repository";

export function getMapReferenceService() {
  const database = getRuntimePrismaDatabase();
  return new MapReferenceService(
    new PrismaProjectRepository(database),
    new PrismaMapReferenceRepository(database),
  );
}
