import type { DataModel } from "@ifc-lite/server-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createIfcServerGeometryClient } from "./server-geometry";

vi.mock("@ifc-lite/server-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ifc-lite/server-client")>()),
  decodeDataModel: vi.fn(async () => ({}) as DataModel),
}));

const streamBody = [
  'data: {"type":"start","cache_key":"test-cache"}',
  'data: {"type":"complete","stats":{},"metadata":{}}',
  "",
].join("\n\n");

function geometryResponse() {
  return new Response(streamBody, {
    headers: { "x-mnemo-max-express-id": "200000000" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("IFC server geometry client", () => {
  it("waits for a pending data model instead of decoding the 202 response", async () => {
    const responses = [
      geometryResponse(),
      new Response(null, { status: 202 }),
      new Response(new Uint8Array([1, 2, 3])),
    ];
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      responses.shift()!,
    );
    vi.stubGlobal("fetch", fetch);

    const loaded = await createIfcServerGeometryClient("/api/ifc").stream(
      () => undefined,
    );

    expect(loaded.result.cache_key).toBe("test-cache");
    expect(fetch.mock.calls).toHaveLength(3);
    expect(fetch.mock.calls[1]?.[0]).toBe("/api/ifc/data-model");
    expect(fetch.mock.calls[2]?.[0]).toBe("/api/ifc/data-model");
  });

  it("reports a missing data model instead of retrying forever", async () => {
    const responses = [geometryResponse(), new Response(null, { status: 404 })];
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      responses.shift()!,
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      createIfcServerGeometryClient("/api/ifc").stream(() => undefined),
    ).rejects.toThrow("HTTP 404");
    expect(fetch.mock.calls).toHaveLength(2);
  });

  it("stops waiting when the model load is cancelled", async () => {
    const controller = new AbortController();
    const responses = [geometryResponse(), new Response(null, { status: 202 })];
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      responses.shift()!,
    );
    vi.stubGlobal("fetch", fetch);

    const loading = createIfcServerGeometryClient("/api/ifc").stream(
      () => undefined,
      controller.signal,
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    controller.abort();

    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch.mock.calls).toHaveLength(2);
  });
});
