import { assetIdSchema, openAssetResultSchema } from "@mnemo/contracts/assets";
import { projectIdSchema } from "@mnemo/contracts/projects";

import { AssetAccessDeniedError } from "@/server/assets/application/asset-errors";
import { getAssetService } from "@/server/assets/asset-service-factory";
import { getCurrentActor } from "@/server/auth/resolve-actor";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/assets/[assetId]/access">,
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
    const access = await getAssetService().open(actor.id, {
      projectId: projectId.data,
      assetId: assetId.data,
    });
    return Response.json(openAssetResultSchema.parse(access), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AssetAccessDeniedError) {
      return Response.json({ error: "Asset not found" }, { status: 404 });
    }
    console.error("Failed to open asset", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
