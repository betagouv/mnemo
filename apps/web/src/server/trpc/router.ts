import { assetRouter } from "./asset-router";
import { createTrpcRouter } from "./init";
import { projectRouter } from "./project-router";
import { pointCloudRouter } from "./point-cloud-router";
import { systemRouter } from "./system-router";

export const appRouter = createTrpcRouter({
  assets: assetRouter,
  projects: projectRouter,
  pointClouds: pointCloudRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
