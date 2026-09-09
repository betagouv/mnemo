import { assetIdSchema } from "@mnemo/contracts/assets";
import { projectIdSchema } from "@mnemo/contracts/projects";
import { notFound } from "next/navigation";

import { getServerCaller } from "@/server/trpc/server-caller";
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

  return (
    <IfcViewer
      assetId={result.asset.id}
      assetName={result.asset.originalFileName}
      initialDownloadUrl={result.downloadUrl}
      projectId={project.id}
      projectName={project.name}
    />
  );
}
