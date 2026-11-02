import { assetIdSchema } from "@mnemo/contracts/assets";
import { projectIdSchema } from "@mnemo/contracts/projects";

import { AssetAccessDeniedError } from "@/server/assets/application/asset-errors";
import { getCurrentActor } from "@/server/auth/resolve-actor";
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
  const actor = await getCurrentActor();
  if (!actor)
    return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    return await getIfcStreamingService().stream(
      actor.id,
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
