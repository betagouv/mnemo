import {
  addBcfCommentInputSchema,
  beginBcfViewpointCaptureInputSchema,
  beginBcfViewpointCaptureResultSchema,
  bcfTopicListSchema,
  bcfTopicSchema,
  completeBcfViewpointCaptureInputSchema,
  createBcfTopicInputSchema,
  listBcfTopicsInputSchema,
  updateBcfTopicStatusInputSchema,
} from "@mnemo/contracts/bcf";
import { TRPCError } from "@trpc/server";

import {
  BcfComponentNotFoundError,
  BcfSnapshotVerificationError,
  BcfTopicAccessDeniedError,
  BcfTopicNotFoundError,
} from "@/server/bcf/application/bcf-topic-errors";
import { getBcfTopicService } from "@/server/bcf/bcf-topic-service-factory";

import { createTrpcRouter, publicProcedure } from "./init";

async function mapBcfError<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof BcfTopicAccessDeniedError ||
      error instanceof BcfTopicNotFoundError
    ) {
      throw new TRPCError({ code: "NOT_FOUND", cause: error });
    }
    if (
      error instanceof BcfComponentNotFoundError ||
      error instanceof BcfSnapshotVerificationError
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error.message,
        cause: error,
      });
    }
    throw error;
  }
}

export const bcfRouter = createTrpcRouter({
  list: publicProcedure
    .input(listBcfTopicsInputSchema)
    .output(bcfTopicListSchema)
    .query(({ ctx, input }) =>
      mapBcfError(() =>
        getBcfTopicService().list(ctx.actor.id, input.projectId),
      ),
    ),
  create: publicProcedure
    .input(createBcfTopicInputSchema)
    .output(bcfTopicSchema)
    .mutation(({ ctx, input }) =>
      mapBcfError(() => getBcfTopicService().create(ctx.actor.id, input)),
    ),
  addComment: publicProcedure
    .input(addBcfCommentInputSchema)
    .output(bcfTopicSchema)
    .mutation(({ ctx, input }) =>
      mapBcfError(() => getBcfTopicService().addComment(ctx.actor.id, input)),
    ),
  updateStatus: publicProcedure
    .input(updateBcfTopicStatusInputSchema)
    .output(bcfTopicSchema)
    .mutation(({ ctx, input }) =>
      mapBcfError(() => getBcfTopicService().updateStatus(ctx.actor.id, input)),
    ),
  beginViewpointCapture: publicProcedure
    .input(beginBcfViewpointCaptureInputSchema)
    .output(beginBcfViewpointCaptureResultSchema)
    .mutation(({ ctx, input }) =>
      mapBcfError(() =>
        getBcfTopicService().beginViewpointCapture(ctx.actor.id, input),
      ),
    ),
  completeViewpointCapture: publicProcedure
    .input(completeBcfViewpointCaptureInputSchema)
    .output(bcfTopicSchema)
    .mutation(({ ctx, input }) =>
      mapBcfError(() =>
        getBcfTopicService().completeViewpointCapture(ctx.actor.id, input),
      ),
    ),
});
