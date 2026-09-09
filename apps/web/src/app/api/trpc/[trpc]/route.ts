import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { createTrpcContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/router";

export const runtime = "nodejs";

const handler = (request: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => createTrpcContext({ headers: request.headers }),
    onError: ({ error, path }) => {
      console.error(
        JSON.stringify({
          event: "trpc_request_failed",
          path,
          code: error.code,
          message: error.message,
        }),
      );
    },
  });

export { handler as GET, handler as POST };
