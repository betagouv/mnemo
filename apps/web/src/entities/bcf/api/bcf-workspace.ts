import { bcfWorkspaceSchema } from "@mnemo/contracts/bcf";

export async function readBcfWorkspace(
  projectId: string,
  signal?: AbortSignal,
) {
  const response = await fetch(`/api/projects/${projectId}/bcf/topics`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("Impossible de charger les remarques.");
  return bcfWorkspaceSchema.parse(await response.json());
}
