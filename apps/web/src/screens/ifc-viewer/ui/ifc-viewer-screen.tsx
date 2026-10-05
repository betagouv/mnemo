import { assetIdSchema, type OpenAssetResult } from "@mnemo/contracts/assets";
import {
  projectIdSchema,
  type ProjectSummary,
} from "@mnemo/contracts/projects";
import { notFound } from "next/navigation";

import { getAssetService } from "@/server/assets/asset-service-factory";
import { getAssistantThreadService } from "@/server/assistant/assistant-thread-service-factory";
import { resolveActor } from "@/server/auth/resolve-actor";
import { getBcfTopicService } from "@/server/bcf/bcf-topic-service-factory";
import { getPointCloudSettingsService } from "@/server/point-clouds/point-cloud-settings-service-factory";
import { getPointCloudSourceService } from "@/server/point-clouds/point-cloud-source-service-factory";
import { getProjectService } from "@/server/projects/project-service-factory";
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

  const actorId = resolveActor().id;
  let result: OpenAssetResult | null = null;
  let project: ProjectSummary | null = null;

  try {
    [project, result] = await Promise.all([
      getProjectService().find(actorId, parsedProjectId.data),
      getAssetService().open(actorId, {
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

  const [assets, bcfTopics, assistantThreads] = await Promise.all([
    getAssetService().list(actorId, project.id),
    getBcfTopicService().list(actorId, project.id),
    getAssistantThreadService().list(actorId, {
      projectId: project.id,
      assetId: result.asset.id,
    }),
  ]);
  const initialAssistantHistory = assistantThreads[0]
    ? await getAssistantThreadService().history(actorId, {
        projectId: project.id,
        assetId: result.asset.id,
        threadId: assistantThreads[0].id,
      })
    : null;
  const pointCloudSources = (
    await Promise.all(
      assets
        .filter(
          (asset) => asset.kind === "point_cloud" && asset.status === "ready",
        )
        .map(async (asset) => {
          try {
            const [access, settings] = await Promise.all([
              getPointCloudSourceService().open(actorId, {
                projectId: project.id,
                assetId: asset.id,
              }),
              getPointCloudSettingsService().get(actorId, {
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
      initialAssistantHistory={initialAssistantHistory}
      initialAssistantThreads={assistantThreads}
      assistantMcpConfigured={isIfcMcpConfigured()}
      initialBcfTopics={bcfTopics}
      initialDownloadUrl={result.downloadUrl}
      key={result.asset.id}
      pointCloudSources={pointCloudSources}
      processing={selectIfcProcessing(result.asset.sizeBytes)}
      projectId={project.id}
      projectName={project.title}
    />
  );
}
