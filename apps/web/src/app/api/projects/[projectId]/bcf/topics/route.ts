import { z } from "zod";
import { projectIdSchema } from "@mnemo/contracts/projects";
import { getCurrentActor } from "@/server/auth/resolve-actor";
import { getBcfTopicService } from "@/server/bcf/bcf-topic-service-factory";
import {
  BcfTopicAccessDeniedError,
  BcfTopicNotFoundError,
} from "@/server/bcf/application/bcf-topic-errors";
export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const actor = await getCurrentActor();
  if (!actor)
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  const project = projectIdSchema.safeParse((await context.params).projectId);
  const topic = new URL(request.url).searchParams.get("topicId");
  if (!project.success || (topic && !z.uuid().safeParse(topic).success))
    return Response.json({ error: "Identifiant invalide." }, { status: 400 });
  const service = getBcfTopicService();
  try {
    const data = new URL(request.url).searchParams.has("markers")
      ? await service.markers(actor.id, project.data)
      : topic
        ? await service.detail(actor.id, project.data, topic)
        : {
            topics: await service.summaries(actor.id, project.data),
            ...(await service.workspace(actor.id, project.data)),
          };
    return Response.json(data, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof BcfTopicAccessDeniedError)
      return Response.json({ error: "Accès refusé." }, { status: 403 });
    if (error instanceof BcfTopicNotFoundError)
      return Response.json({ error: "Remarque introuvable." }, { status: 404 });
    throw error;
  }
}
