import { assetListSchema } from "@mnemo/contracts/assets";
import { projectIdSchema } from "@mnemo/contracts/projects";
import { AssetAccessDeniedError } from "@/server/assets/application/asset-errors";
import { getAssetService } from "@/server/assets/asset-service-factory";
import { getCurrentActor } from "@/server/auth/resolve-actor";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/assets">,
) {
  const projectId = projectIdSchema.safeParse((await context.params).projectId);
  if (!projectId.success)
    return Response.json({ error: "Project not found" }, { status: 404 });
  const actor = await getCurrentActor();
  if (!actor)
    return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    const assets = await getAssetService().list(actor.id, projectId.data);
    return Response.json(assetListSchema.parse(assets), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof AssetAccessDeniedError)
      return Response.json({ error: "Project not found" }, { status: 404 });
    console.error("Failed to read project assets", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
