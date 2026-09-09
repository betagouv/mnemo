import {
  assistantThreadHistorySchema,
  assistantThreadListSchema,
  assistantThreadSummarySchema,
  createAssistantThreadInputSchema,
  deleteAssistantThreadInputSchema,
  getAssistantThreadInputSchema,
  listAssistantThreadsInputSchema,
} from "@mnemo/contracts/assistant";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { AssetAccessDeniedError } from "@/server/assets/application/asset-errors";
import { AssistantThreadAccessDeniedError } from "@/server/assistant/application/assistant-thread-errors";
import { getAssistantThreadService } from "@/server/assistant/assistant-thread-service-factory";

import { createTrpcRouter, publicProcedure } from "./init";

async function mapAssistantThreadError<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof AssistantThreadAccessDeniedError ||
      error instanceof AssetAccessDeniedError
    ) {
      throw new TRPCError({ code: "NOT_FOUND", cause: error });
    }
    throw error;
  }
}

export const assistantRouter = createTrpcRouter({
  list: publicProcedure
    .input(listAssistantThreadsInputSchema)
    .output(assistantThreadListSchema)
    .query(({ ctx, input }) =>
      mapAssistantThreadError(() =>
        getAssistantThreadService().list(ctx.actor.id, input),
      ),
    ),
  create: publicProcedure
    .input(createAssistantThreadInputSchema)
    .output(assistantThreadSummarySchema)
    .mutation(({ ctx, input }) =>
      mapAssistantThreadError(() =>
        getAssistantThreadService().create(ctx.actor.id, input),
      ),
    ),
  history: publicProcedure
    .input(getAssistantThreadInputSchema)
    .output(assistantThreadHistorySchema)
    .query(({ ctx, input }) =>
      mapAssistantThreadError(() =>
        getAssistantThreadService().history(ctx.actor.id, input),
      ),
    ),
  delete: publicProcedure
    .input(deleteAssistantThreadInputSchema)
    .output(z.object({ deleted: z.literal(true) }))
    .mutation(({ ctx, input }) =>
      mapAssistantThreadError(() =>
        getAssistantThreadService().delete(ctx.actor.id, input),
      ),
    ),
});
