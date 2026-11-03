import { getCurrentActor } from "@/server/auth/resolve-actor";
import { getBcfTopicService } from "@/server/bcf/bcf-topic-service-factory";
import { bcfSnapshotResponse } from "@/server/bcf/transport/bcf-snapshot-http";
export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      projectId: string;
      topicId: string;
      viewpointId: string;
    }>;
  },
) {
  const actor = await getCurrentActor();
  if (!actor)
    return Response.json(
      { error: "Connexion requise." },
      { status: 401, headers: { "cache-control": "private, no-store" } },
    );
  return bcfSnapshotResponse({
    actorId: actor.id,
    params: await context.params,
    service: getBcfTopicService(),
  });
}
