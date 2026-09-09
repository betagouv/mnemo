import { z } from "zod";

const requestIdSchema = z.uuid();

export async function createTrpcContext({ headers }: { headers: Headers }) {
  const forwardedRequestId = requestIdSchema.safeParse(
    headers.get("x-request-id"),
  );

  return {
    headers,
    requestId: forwardedRequestId.success
      ? forwardedRequestId.data
      : crypto.randomUUID(),
  };
}

export type TrpcContext = Awaited<ReturnType<typeof createTrpcContext>>;
