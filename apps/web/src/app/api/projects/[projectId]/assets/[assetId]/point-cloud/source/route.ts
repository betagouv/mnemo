import { assetIdSchema } from "@mnemo/contracts/assets";
import { pointCloudSourceSchema } from "@mnemo/contracts/point-clouds";
import { projectIdSchema } from "@mnemo/contracts/projects";

import { resolveActor } from "@/server/auth/resolve-actor";
import { PointCloudSourceAccessDeniedError } from "@/server/point-clouds/application/point-cloud-source-service";
import { getPointCloudSourceService } from "@/server/point-clouds/point-cloud-source-service-factory";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/assets/[assetId]/point-cloud/source">,
) {
  const params = await context.params;
  const projectId = projectIdSchema.safeParse(params.projectId);
  const assetId = assetIdSchema.safeParse(params.assetId);
  if (!projectId.success || !assetId.success) {
    return Response.json({ error: "Point cloud not found" }, { status: 404 });
  }

  try {
    const source = await getPointCloudSourceService().open(resolveActor().id, {
      projectId: projectId.data,
      assetId: assetId.data,
    });
    return Response.json(pointCloudSourceSchema.parse(source), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PointCloudSourceAccessDeniedError) {
      return Response.json({ error: "Point cloud not found" }, { status: 404 });
    }
    console.error("Failed to open point cloud", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
