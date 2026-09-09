import { z } from "zod";

import { resolveActor } from "@/server/auth/resolve-actor";

const requestIdSchema = z.uuid();

export async function createTrpcContext({ headers }: { headers: Headers }) {
  const forwardedRequestId = requestIdSchema.safeParse(
    headers.get("x-request-id"),
  );

  return {
    actor: resolveActor(),
    headers,
    requestId: forwardedRequestId.success
      ? forwardedRequestId.data
      : crypto.randomUUID(),
  };
}

export type TrpcContext = Awaited<ReturnType<typeof createTrpcContext>>;
