import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { createTrpcContext } from "./context";
import { appRouter } from "./router";

export const getServerCaller = cache(async () =>
  appRouter.createCaller(
    await createTrpcContext({
      headers: await headers(),
    }),
  ),
);
