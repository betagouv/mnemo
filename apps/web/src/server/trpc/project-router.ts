import {
  createProjectInputSchema,
  deleteProjectInputSchema,
  getProjectInputSchema,
  projectListSchema,
  projectSummarySchema,
} from "@mnemo/contracts/projects";

import { getProjectService } from "@/server/projects/project-service-factory";
import { disposeIfcMcpAsset } from "@/server/assistant/infrastructure/ifc-mcp-runtime";
import { deletionAcceptedSchema } from "@mnemo/contracts/assets";
import { TRPCError } from "@trpc/server";

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
  delete: publicProcedure
    .input(deleteProjectInputSchema)
    .output(deletionAcceptedSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await getProjectService().delete(
        ctx.actor.id,
        input.projectId,
      );
      if (!result.accepted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await Promise.all(
        result.assetIds.map((assetId) =>
          disposeIfcMcpAsset(assetId).catch((error) => {
            console.error("Failed to dispose project IFC MCP cache", {
              assetId,
              error: error instanceof Error ? error.message : String(error),
            });
          }),
        ),
      );
      return { accepted: true as const };
    }),
});
