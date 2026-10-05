import { getAssetService } from "@/server/assets/asset-service-factory";
import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";

import { AssistantThreadService } from "./application/assistant-thread-service";
import { PrismaAssistantThreadRepository } from "./infrastructure/prisma-assistant-thread-repository";

let service: AssistantThreadService | undefined;

export function getAssistantThreadService() {
  service ??= new AssistantThreadService(
    new PrismaAssistantThreadRepository(getRuntimePrismaDatabase()),
    (actorId, input) => getAssetService().locateOriginal(actorId, input),
  );
  return service;
}
