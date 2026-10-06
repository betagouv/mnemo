import { projectIdSchema } from "@mnemo/contracts/projects";
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
import { ProjectViewer } from "@/widgets/ifc-viewer";

export async function ProjectViewerScreen({
  projectId,
}: {
  projectId: string;
}) {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) notFound();

  const actorId = resolveActor().id;
  const project = await getProjectService().find(actorId, parsed.data);
  if (!project) notFound();

  const [assets, bcfTopics] = await Promise.all([
    getAssetService().list(actorId, project.id),
    getBcfTopicService().list(actorId, project.id),
  ]);
  const ifcSources = assets
    .filter((asset) => asset.kind === "ifc" && asset.status === "ready")
    .map((asset) => ({
      assetId: asset.id,
      fileName: asset.originalFileName,
      processing: selectIfcProcessing(asset.sizeBytes),
    }));
  const assistantSessions = Object.fromEntries(
    await Promise.all(
      ifcSources.map(async ({ assetId }) => {
        const threads = await getAssistantThreadService().list(actorId, {
          projectId: project.id,
          assetId,
        });
        const history = threads[0]
          ? await getAssistantThreadService().history(actorId, {
              projectId: project.id,
              assetId,
              threadId: threads[0].id,
            })
          : null;
        return [assetId, { threads, history }] as const;
      }),
    ),
  );
  const pointCloudResults = await Promise.all(
    assets
      .filter(
        (asset) => asset.kind === "point_cloud" && asset.status === "ready",
      )
      .map(async (asset) => {
        try {
          const [source, settings] = await Promise.all([
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
            source,
            settings,
          };
        } catch (error) {
          return {
            assetId: asset.id,
            fileName: asset.originalFileName,
            error:
              error instanceof Error
                ? error.message
                : "Source du nuage indisponible.",
          };
        }
      }),
  );
  const pointCloudSources = pointCloudResults.flatMap((result) =>
    result.source && result.settings
      ? [
          {
            assetId: result.assetId,
            fileName: result.fileName,
            source: result.source,
            settings: result.settings,
          },
        ]
      : [],
  );
  const pointCloudFailures = pointCloudResults.flatMap((result) =>
    result.error
      ? [
          {
            assetId: result.assetId,
            fileName: result.fileName,
            error: result.error,
          },
        ]
      : [],
  );

  return (
    <ProjectViewer
      assistantConfigured={isAssistantConfigured()}
      assistantMcpConfigured={isIfcMcpConfigured()}
      ifcSources={ifcSources}
      assistantSessions={assistantSessions}
      initialBcfTopics={bcfTopics}
      key={project.id}
      pointCloudFailures={pointCloudFailures}
      pointCloudSources={pointCloudSources}
      projectId={project.id}
      projectName={project.title}
    />
  );
}
