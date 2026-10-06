"use server";

import {
  createProjectInputSchema,
  deleteProjectInputSchema,
  updateProjectInputSchema,
  type CreateProjectInput,
  type GetProjectInput,
  type UpdateProjectInput,
} from "@mnemo/contracts/projects";
import { revalidatePath } from "next/cache";

import { disposeIfcMcpAsset } from "@/server/assistant/infrastructure/ifc-mcp-runtime";
import { resolveActor } from "@/server/auth/resolve-actor";

import { getProjectService } from "./project-service-factory";

export async function createProject(input: CreateProjectInput) {
  return getProjectService().create(
    resolveActor().id,
    createProjectInputSchema.parse(input),
  );
}

export async function updateProject(input: UpdateProjectInput) {
  const parsed = updateProjectInputSchema.parse(input);
  const updated = await getProjectService().update(resolveActor().id, parsed);
  if (!updated) throw new Error("Project not found or access denied");
  revalidatePath("/projets");
  revalidatePath(`/projets/${updated.id}`);
  return updated;
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
