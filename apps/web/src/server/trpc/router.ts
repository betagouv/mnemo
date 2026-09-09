import { createTrpcRouter } from "./init";
import { systemRouter } from "./system-router";

export const appRouter = createTrpcRouter({
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
