import { assetIdSchema } from "@mnemo/contracts/assets";
import { projectIdSchema } from "@mnemo/contracts/projects";

import { AssetAccessDeniedError } from "@/server/assets/application/asset-errors";
import { resolveActor } from "@/server/auth/resolve-actor";
import { getIfcStreamingService } from "@/server/ifc/ifc-streaming-service-factory";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/projects/[projectId]/assets/[assetId]/ifc/stream">,
) {
  const params = await context.params;
  const projectId = projectIdSchema.safeParse(params.projectId);
  const assetId = assetIdSchema.safeParse(params.assetId);
  if (!projectId.success || !assetId.success) {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }
  try {
    return await getIfcStreamingService().stream(
      resolveActor().id,
      projectId.data,
      assetId.data,
      request.signal,
    );
  } catch (error) {
    if (error instanceof AssetAccessDeniedError) {
      return Response.json({ error: "Asset not found" }, { status: 404 });
    }
    console.error("IFC geometry stream failed", error);
    return Response.json(
      { error: "IFC geometry unavailable" },
      { status: 502 },
    );
  }
}
