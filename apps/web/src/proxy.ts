import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

function credentialsMatch(
  authorization: string | null,
  user: string,
  password: string,
) {
  if (!authorization?.startsWith("Basic ") || authorization.length > 4096) {
    return false;
  }

  const encoded = authorization.slice(6);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    return false;
  }

  const supplied = Buffer.from(encoded, "base64");
  const expected = Buffer.from(`${user}:${password}`, "utf8");
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expected).digest();

  return timingSafeEqual(suppliedHash, expectedHash);
}

export function proxy(request: NextRequest) {
  const onScalingo = Boolean(
    process.env.APP || process.env.SCALINGO_APPLICATION_ID,
  );
  const environment = process.env.MNEMO_DEPLOYMENT_ENV ?? "local";

  if (environment === "local" && !onScalingo) {
    return NextResponse.next();
  }

  // No production identity provider exists yet. Never expose the development actor
  // on a deployed app without an explicitly configured staging access gate.
  if (environment !== "staging") {
    return new NextResponse("Application non configurée", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const user = process.env.MNEMO_STAGING_USER;
  const password = process.env.MNEMO_STAGING_PASSWORD;
  if (!user || user.includes(":") || !password) {
    return new NextResponse("Accès de préproduction non configuré", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!credentialsMatch(request.headers.get("authorization"), user, password)) {
    return new NextResponse("Authentification requise", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Basic realm="Mnemo staging", charset="UTF-8"',
      },
    });
  }

  return NextResponse.next();
}
