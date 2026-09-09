import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("tRPC fetch transport", () => {
  it("exposes the system info procedure", async () => {
    const requestId = "5cfed938-e6d8-4a01-ad8e-ae2629ef010a";
    const response = await GET(
      new Request("http://localhost/api/trpc/system.info", {
        headers: { "x-request-id": requestId },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        data: {
          service: "mnemo-web",
          apiVersion: "v1",
          status: "ok",
          requestId,
        },
      },
    });
  });
});
