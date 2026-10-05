"use server";

import {
  createProjectInputSchema,
  deleteProjectInputSchema,
  type CreateProjectInput,
  type GetProjectInput,
} from "@mnemo/contracts/projects";

import { disposeIfcMcpAsset } from "@/server/assistant/infrastructure/ifc-mcp-runtime";
import { resolveActor } from "@/server/auth/resolve-actor";

import { getProjectService } from "./project-service-factory";

export async function createProject(input: CreateProjectInput) {
  return getProjectService().create(
    resolveActor().id,
    createProjectInputSchema.parse(input),
  );
}

export async function deleteProject(input: GetProjectInput) {
  const { projectId } = deleteProjectInputSchema.parse(input);
  const result = await getProjectService().delete(resolveActor().id, projectId);
  if (!result.accepted) throw new Error("Project not found");
  await Promise.all(
    result.assetIds.map((assetId) =>
      disposeIfcMcpAsset(assetId).catch((error) => {
        console.error("Failed to dispose IFC MCP asset cache", {
          assetId,
          error,
        });
      }),
    ),
  );
  return { accepted: true as const };
}
