import {
  createProjectInputSchema,
  getProjectInputSchema,
  projectListSchema,
  projectSummarySchema,
} from "@mnemo/contracts/projects";

import { getProjectService } from "@/server/projects/project-service-factory";

import { createTrpcRouter, publicProcedure } from "./init";

export const projectRouter = createTrpcRouter({
  list: publicProcedure.output(projectListSchema).query(({ ctx }) => {
    return getProjectService().list(ctx.actor.id);
  }),
  find: publicProcedure
    .input(getProjectInputSchema)
    .output(projectSummarySchema.nullable())
    .query(({ ctx, input }) => {
      return getProjectService().find(ctx.actor.id, input.projectId);
    }),
  create: publicProcedure
    .input(createProjectInputSchema)
    .output(projectSummarySchema)
    .mutation(({ ctx, input }) => {
      return getProjectService().create(ctx.actor.id, input);
    }),
});
