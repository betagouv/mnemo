import { getRuntimeDatabase } from "@/server/database/runtime-database";
import { DrizzleProjectRepository } from "@/server/projects/infrastructure/drizzle-project-repository";

import { BcfTopicService } from "./application/bcf-topic-service";
import { DrizzleBcfTopicRepository } from "./infrastructure/drizzle-bcf-topic-repository";

export function getBcfTopicService() {
  const database = getRuntimeDatabase();
  return new BcfTopicService(
    new DrizzleBcfTopicRepository(database),
    new DrizzleProjectRepository(database),
  );
}
