import {
  pointCloudSettingsInputSchema,
  pointCloudSettingsSchema,
  updatePointCloudSettingsInputSchema,
} from "@mnemo/contracts/point-clouds";
import { TRPCError } from "@trpc/server";

import { PointCloudSettingsAccessDeniedError } from "@/server/point-clouds/application/point-cloud-settings-service";
import { getPointCloudSettingsService } from "@/server/point-clouds/point-cloud-settings-service-factory";

import { createTrpcRouter, publicProcedure } from "./init";

async function mapPointCloudError<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PointCloudSettingsAccessDeniedError) {
      throw new TRPCError({ code: "NOT_FOUND", cause: error });
    }
    throw error;
  }
}

export const pointCloudRouter = createTrpcRouter({
  settings: publicProcedure
    .input(pointCloudSettingsInputSchema)
    .output(pointCloudSettingsSchema)
    .query(({ ctx, input }) =>
      mapPointCloudError(() =>
        getPointCloudSettingsService().get(ctx.actor.id, input),
      ),
    ),
  updateSettings: publicProcedure
    .input(updatePointCloudSettingsInputSchema)
    .output(pointCloudSettingsSchema)
    .mutation(({ ctx, input }) =>
      mapPointCloudError(() =>
        getPointCloudSettingsService().update(ctx.actor.id, input),
      ),
    ),
});
