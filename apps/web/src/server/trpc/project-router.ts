import {
  createProjectInputSchema,
  projectListSchema,
  projectSummarySchema,
} from "@mnemo/contracts/projects";

import { getProjectService } from "@/server/projects/project-service-factory";

import { createTrpcRouter, publicProcedure } from "./init";

export const projectRouter = createTrpcRouter({
  list: publicProcedure.output(projectListSchema).query(({ ctx }) => {
    return getProjectService().list(ctx.actor.id);
  }),
  create: publicProcedure
    .input(createProjectInputSchema)
    .output(projectSummarySchema)
    .mutation(({ ctx, input }) => {
      return getProjectService().create(ctx.actor.id, input);
    }),
});
