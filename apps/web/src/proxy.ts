import { NextResponse } from "next/server";

// Refuse every request when the sole authentication provider is unconfigured.
export function proxy() {
  if (
    !process.env.BETTER_AUTH_URL ||
    (process.env.BETTER_AUTH_SECRET?.length ?? 0) < 32
  ) {
    return new NextResponse("Authentification non configurée", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.next();
}
