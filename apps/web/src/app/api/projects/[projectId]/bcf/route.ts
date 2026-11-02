import { getCurrentActor } from "@/server/auth/resolve-actor";
import { getBcfTopicService } from "@/server/bcf/bcf-topic-service-factory";
import {
  exportBcfArchiveResponse,
  importBcfArchiveResponse,
} from "@/server/bcf/transport/bcf-archive-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const actor = await getCurrentActor();
  if (!actor)
    return Response.json({ error: "Authentication required" }, { status: 401 });
  const { projectId } = await context.params;
  return exportBcfArchiveResponse({
    actorId: actor.id,
    projectId,
    service: getBcfTopicService(),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const actor = await getCurrentActor();
  if (!actor)
    return Response.json({ error: "Authentication required" }, { status: 401 });
  const { projectId } = await context.params;
  return importBcfArchiveResponse({
    actorId: actor.id,
    projectId,
    request,
    service: getBcfTopicService(),
  });
}
