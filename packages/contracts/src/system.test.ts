import { describe, expect, it } from "vitest";

import { systemInfoSchema } from "./system";

describe("systemInfoSchema", () => {
  it("accepts the stable API status contract", () => {
    const result = systemInfoSchema.safeParse({
      service: "mnemo-web",
      apiVersion: "v1",
      status: "ok",
      requestId: "5cfed938-e6d8-4a01-ad8e-ae2629ef010a",
      timestamp: "2026-09-09T12:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("rejects responses that drift from the contract", () => {
    const result = systemInfoSchema.safeParse({
      service: "mnemo-web",
      apiVersion: "v2",
      status: "ok",
      requestId: "not-a-request-id",
      timestamp: "today",
    });

    expect(result.success).toBe(false);
  });
});
