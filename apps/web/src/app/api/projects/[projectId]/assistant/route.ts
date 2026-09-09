import { handleAssistantHttpRequest } from "@/server/assistant/transport/assistant-http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: RouteContext<"/api/projects/[projectId]/assistant">,
) {
  const { projectId } = await context.params;
  return handleAssistantHttpRequest(request, projectId);
}
