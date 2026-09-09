import {
  assetListSchema,
  assetSummarySchema,
  beginAssetUploadInputSchema,
  beginAssetUploadResultSchema,
  completeAssetUploadInputSchema,
  listAssetsInputSchema,
  openAssetInputSchema,
  openAssetResultSchema,
} from "@mnemo/contracts/assets";
import { TRPCError } from "@trpc/server";

import {
  AssetAccessDeniedError,
  AssetUploadVerificationError,
  UnsupportedAssetFileError,
} from "@/server/assets/application/asset-errors";
import { getAssetService } from "@/server/assets/asset-service-factory";

import { createTrpcRouter, publicProcedure } from "./init";

async function mapAssetError<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AssetAccessDeniedError) {
      throw new TRPCError({ code: "NOT_FOUND", cause: error });
    }

    if (
      error instanceof UnsupportedAssetFileError ||
      error instanceof AssetUploadVerificationError
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

export const assetRouter = createTrpcRouter({
  list: publicProcedure
    .input(listAssetsInputSchema)
    .output(assetListSchema)
    .query(({ ctx, input }) =>
      mapAssetError(() =>
        getAssetService().list(ctx.actor.id, input.projectId),
      ),
    ),
  beginUpload: publicProcedure
    .input(beginAssetUploadInputSchema)
    .output(beginAssetUploadResultSchema)
    .mutation(({ ctx, input }) =>
      mapAssetError(() => getAssetService().beginUpload(ctx.actor.id, input)),
    ),
  completeUpload: publicProcedure
    .input(completeAssetUploadInputSchema)
    .output(assetSummarySchema)
    .mutation(({ ctx, input }) =>
      mapAssetError(() =>
        getAssetService().completeUpload(ctx.actor.id, input),
      ),
    ),
  open: publicProcedure
    .input(openAssetInputSchema)
    .output(openAssetResultSchema)
    .query(({ ctx, input }) =>
      mapAssetError(() => getAssetService().open(ctx.actor.id, input)),
    ),
});
