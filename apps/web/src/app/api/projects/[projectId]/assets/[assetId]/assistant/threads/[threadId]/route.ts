import { assetIdSchema } from "@mnemo/contracts/assets";
import {
  assistantThreadHistorySchema,
  assistantThreadIdSchema,
} from "@mnemo/contracts/assistant";
import { projectIdSchema } from "@mnemo/contracts/projects";

import { AssistantThreadAccessDeniedError } from "@/server/assistant/application/assistant-thread-errors";
import { getAssistantThreadService } from "@/server/assistant/assistant-thread-service-factory";
import { resolveActor } from "@/server/auth/resolve-actor";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/assets/[assetId]/assistant/threads/[threadId]">,
) {
  const params = await context.params;
  const projectId = projectIdSchema.safeParse(params.projectId);
  const assetId = assetIdSchema.safeParse(params.assetId);
  const threadId = assistantThreadIdSchema.safeParse(params.threadId);
  if (!projectId.success || !assetId.success || !threadId.success) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  try {
    const history = await getAssistantThreadService().history(
      resolveActor().id,
      {
        projectId: projectId.data,
        assetId: assetId.data,
        threadId: threadId.data,
      },
    );
    return Response.json(assistantThreadHistorySchema.parse(history), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AssistantThreadAccessDeniedError) {
      return Response.json({ error: "Thread not found" }, { status: 404 });
    }
    console.error("Failed to load assistant thread", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
