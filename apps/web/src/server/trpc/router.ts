import { createTrpcRouter } from "./init";
import { projectRouter } from "./project-router";
import { systemRouter } from "./system-router";

export const appRouter = createTrpcRouter({
  projects: projectRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
