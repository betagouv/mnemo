import { assetRouter } from "./asset-router";
import { createTrpcRouter } from "./init";
import { projectRouter } from "./project-router";
import { systemRouter } from "./system-router";

export const appRouter = createTrpcRouter({
  assets: assetRouter,
  projects: projectRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
