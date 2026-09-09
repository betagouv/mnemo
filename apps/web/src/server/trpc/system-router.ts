import { systemInfoSchema } from "@mnemo/contracts/system";

import { createTrpcRouter, publicProcedure } from "./init";

export const systemRouter = createTrpcRouter({
  info: publicProcedure.output(systemInfoSchema).query(({ ctx }) => ({
    service: "mnemo-web",
    apiVersion: "v1",
    status: "ok",
    requestId: ctx.requestId,
    timestamp: new Date().toISOString(),
  })),
});
