export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    service: "mnemo-web",
    status: "ok",
  });
}
