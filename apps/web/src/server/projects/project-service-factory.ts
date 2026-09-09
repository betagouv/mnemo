import { getRuntimeDatabase } from "@/server/database/runtime-database";

import { ProjectService } from "./application/project-service";
import { DrizzleProjectRepository } from "./infrastructure/drizzle-project-repository";

export function getProjectService() {
  return new ProjectService(new DrizzleProjectRepository(getRuntimeDatabase()));
}
