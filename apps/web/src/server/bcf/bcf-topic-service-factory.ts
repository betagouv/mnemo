import {
  BcfArchiveLimitError,
  decodeBcfArchive,
  encodeBcfArchive,
} from "@mnemo/bcf-adapter";

import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { PrismaProjectRepository } from "@/server/projects/infrastructure/prisma-project-repository";
import { getRuntimeObjectStorage } from "@/server/storage/runtime-object-storage";

import { BcfTopicService } from "./application/bcf-topic-service";
import { BcfArchiveTooLargeError } from "./application/bcf-topic-errors";
import { PrismaBcfTopicRepository } from "./infrastructure/prisma-bcf-topic-repository";

export function getBcfTopicService() {
  const database = getRuntimePrismaDatabase();
  return new BcfTopicService(
    new PrismaBcfTopicRepository(database),
    new PrismaProjectRepository(database),
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
