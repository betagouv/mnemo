"use server";

import {
  createAssistantThreadInputSchema,
  deleteAssistantThreadInputSchema,
  type AssistantThreadSummary,
} from "@mnemo/contracts/assistant";
import { z } from "zod";

import { resolveActor } from "@/server/auth/resolve-actor";

import { getAssistantThreadService } from "./assistant-thread-service-factory";

type CreateInput = z.input<typeof createAssistantThreadInputSchema>;
type DeleteInput = z.input<typeof deleteAssistantThreadInputSchema>;

export async function createAssistantThread(
  input: CreateInput,
): Promise<AssistantThreadSummary> {
  return getAssistantThreadService().create(
    resolveActor().id,
    createAssistantThreadInputSchema.parse(input),
  );
}

export async function deleteAssistantThread(input: DeleteInput) {
  return getAssistantThreadService().delete(
    resolveActor().id,
    deleteAssistantThreadInputSchema.parse(input),
  );
}
