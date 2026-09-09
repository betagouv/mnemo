import { assetIdSchema } from "@mnemo/contracts/assets";
import { projectIdSchema } from "@mnemo/contracts/projects";
import { notFound } from "next/navigation";

import { getServerCaller } from "@/server/trpc/server-caller";
import { isAssistantConfigured } from "@/shared/config/assistant/server-only";
import { selectIfcProcessing } from "@/shared/config/ifc-processing/server-only";
import { isIfcMcpConfigured } from "@/shared/config/ifc-mcp/server-only";
import { IfcViewer } from "@/widgets/ifc-viewer";

export async function IfcViewerScreen({
  assetId,
  projectId,
}: {
  assetId: string;
  projectId: string;
}) {
  const parsedAssetId = assetIdSchema.safeParse(assetId);
  const parsedProjectId = projectIdSchema.safeParse(projectId);

  if (!parsedAssetId.success || !parsedProjectId.success) {
    notFound();
  }

  const caller = await getServerCaller();
  let result: Awaited<ReturnType<typeof caller.assets.open>> | null = null;
  let project: Awaited<ReturnType<typeof caller.projects.find>> = null;

  try {
    [project, result] = await Promise.all([
      caller.projects.find({ projectId: parsedProjectId.data }),
      caller.assets.open({
        projectId: parsedProjectId.data,
        assetId: parsedAssetId.data,
      }),
    ]);
  } catch {
    notFound();
  }

  if (!project || !result || result.asset.kind !== "ifc") {
    notFound();
  }

  const [assets, bcfTopics] = await Promise.all([
    caller.assets.list({ projectId: project.id }),
    caller.bcf.list({ projectId: project.id }),
  ]);
  const pointCloudSources = (
    await Promise.all(
      assets
        .filter(
          (asset) => asset.kind === "point_cloud" && asset.status === "ready",
        )
        .map(async (asset) => {
          try {
            const [access, settings] = await Promise.all([
              caller.pointClouds.source({
                projectId: project.id,
                assetId: asset.id,
              }),
              caller.pointClouds.settings({
                projectId: project.id,
                assetId: asset.id,
              }),
            ]);
            return {
              assetId: asset.id,
              fileName: asset.originalFileName,
              source: access,
              settings,
            };
          } catch {
            return null;
          }
        }),
    )
  ).filter((source) => source !== null);

  return (
    <IfcViewer
      assetId={result.asset.id}
      assetName={result.asset.originalFileName}
      assistantConfigured={isAssistantConfigured()}
      assistantMcpConfigured={isIfcMcpConfigured()}
      initialBcfTopics={bcfTopics}
      initialDownloadUrl={result.downloadUrl}
      key={result.asset.id}
      pointCloudSources={pointCloudSources}
      processing={selectIfcProcessing(result.asset.sizeBytes)}
      projectId={project.id}
      projectName={project.name}
    />
  );
}
