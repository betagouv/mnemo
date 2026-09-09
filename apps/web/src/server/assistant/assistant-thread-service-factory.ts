import { getAssetService } from "@/server/assets/asset-service-factory";
import { getRuntimeDatabase } from "@/server/database/runtime-database";

import { AssistantThreadService } from "./application/assistant-thread-service";
import { DrizzleAssistantThreadRepository } from "./infrastructure/drizzle-assistant-thread-repository";

let service: AssistantThreadService | undefined;

export function getAssistantThreadService() {
  service ??= new AssistantThreadService(
    new DrizzleAssistantThreadRepository(getRuntimeDatabase()),
    (actorId, input) => getAssetService().locateOriginal(actorId, input),
  );
  return service;
}
