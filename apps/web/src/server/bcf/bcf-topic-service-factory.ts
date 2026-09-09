import {
  BcfArchiveLimitError,
  decodeBcfArchive,
  encodeBcfArchive,
} from "@mnemo/bcf-adapter";

import { getRuntimeDatabase } from "@/server/database/runtime-database";
import { DrizzleProjectRepository } from "@/server/projects/infrastructure/drizzle-project-repository";
import { getRuntimeObjectStorage } from "@/server/storage/runtime-object-storage";

import { BcfTopicService } from "./application/bcf-topic-service";
import { BcfArchiveTooLargeError } from "./application/bcf-topic-errors";
import { DrizzleBcfTopicRepository } from "./infrastructure/drizzle-bcf-topic-repository";

export function getBcfTopicService() {
  const database = getRuntimeDatabase();
  return new BcfTopicService(
    new DrizzleBcfTopicRepository(database),
    new DrizzleProjectRepository(database),
    getRuntimeObjectStorage(),
    {
      decode: async (bytes) => {
        try {
          return await decodeBcfArchive(bytes);
        } catch (error) {
          if (error instanceof BcfArchiveLimitError) {
            throw new BcfArchiveTooLargeError(error.message);
          }
          throw error;
        }
      },
      encode: encodeBcfArchive,
    },
  );
}
