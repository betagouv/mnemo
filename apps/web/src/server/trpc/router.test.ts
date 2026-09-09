import { describe, expect, it } from "vitest";

import { createTrpcContext } from "./context";
import { appRouter } from "./router";

describe("appRouter", () => {
  it("returns a contract-validated system response", async () => {
    const requestId = "5cfed938-e6d8-4a01-ad8e-ae2629ef010a";
    const context = await createTrpcContext({
      headers: new Headers({ "x-request-id": requestId }),
    });
    const caller = appRouter.createCaller(context);

    const result = await caller.system.info();

    expect(result).toMatchObject({
      service: "mnemo-web",
      apiVersion: "v1",
      status: "ok",
      requestId,
    });
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it("replaces an invalid incoming request identifier", async () => {
    const context = await createTrpcContext({
      headers: new Headers({ "x-request-id": "invalid" }),
    });

    expect(context.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
