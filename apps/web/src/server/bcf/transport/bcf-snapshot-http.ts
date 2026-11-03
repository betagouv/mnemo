import { z } from "zod";
import type { BcfTopicService } from "../application/bcf-topic-service";
import {
  BcfTopicAccessDeniedError,
  BcfTopicNotFoundError,
} from "../application/bcf-topic-errors";
const ids = z.object({
  projectId: z.uuid(),
  topicId: z.uuid(),
  viewpointId: z.uuid(),
});
/** Re-authorize every image request; only S3's short-lived redirect is exposed. */
export async function bcfSnapshotResponse(input: {
  actorId: string;
  params: unknown;
  service: Pick<BcfTopicService, "snapshotUrl">;
}) {
  const parsed = ids.safeParse(input.params);
  const headers = {
    "cache-control": "private, no-store",
    "cross-origin-resource-policy": "same-origin",
  };
  if (!parsed.success)
    return Response.json(
      { error: "Identifiant invalide." },
      { status: 400, headers },
    );
  try {
    const url = await input.service.snapshotUrl(
      input.actorId,
      parsed.data.projectId,
      parsed.data.topicId,
      parsed.data.viewpointId,
    );
    return new Response(null, {
      status: 307,
      headers: { ...headers, location: url },
    });
  } catch (error) {
    if (error instanceof BcfTopicAccessDeniedError)
      return Response.json(
        { error: "Accès refusé." },
        { status: 403, headers },
      );
    if (error instanceof BcfTopicNotFoundError)
      return Response.json(
        { error: "Capture introuvable." },
        { status: 404, headers },
      );
    throw error;
  }
}
