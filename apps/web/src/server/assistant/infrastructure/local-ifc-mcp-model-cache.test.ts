import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalIfcMcpModelCache } from "./local-ifc-mcp-model-cache";

const assetId = "00000000-0000-4000-8000-000000000020";
const directories: string[] = [];

async function directory() {
  const path = await mkdtemp(join(tmpdir(), "mnemo-mcp-cache-"));
  directories.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("LocalIfcMcpModelCache", () => {
  it("streams an original to an atomic asset-owned cache path", async () => {
    const cacheDirectory = await directory();
    const readObjectStream = vi.fn(async () =>
      (async function* () {
        yield Uint8Array.of(1, 2);
        yield Uint8Array.of(3);
      })(),
    );
    const cache = new LocalIfcMcpModelCache(
      { readObjectStream },
      { cacheDirectory, mcpModelDirectory: "/app/models" },
    );

    await expect(
      cache.ensure({
        assetId,
        objectKey: "projects/project/assets/asset/original.ifc",
        sizeBytes: 3,
      }),
    ).resolves.toBe(`/app/models/${assetId}.ifc`);
    await expect(
      readFile(join(cacheDirectory, `${assetId}.ifc`)),
    ).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it("reuses a complete copy without downloading the object again", async () => {
    const cacheDirectory = await directory();
    const readObjectStream = vi.fn(async () =>
      (async function* () {
        yield Uint8Array.of(1, 2, 3);
      })(),
    );
    const cache = new LocalIfcMcpModelCache(
      { readObjectStream },
      { cacheDirectory, mcpModelDirectory: "/app/models" },
    );
    const source = { assetId, objectKey: "original", sizeBytes: 3 };

    await cache.ensure(source);
    await cache.ensure(source);

    expect(readObjectStream).toHaveBeenCalledOnce();
  });

  it("removes an incomplete temporary copy", async () => {
    const cacheDirectory = await directory();
    const cache = new LocalIfcMcpModelCache(
      {
        readObjectStream: vi.fn(async () =>
          (async function* () {
            yield Uint8Array.of(1);
          })(),
        ),
      },
      { cacheDirectory, mcpModelDirectory: "/app/models" },
    );

    await expect(
      cache.ensure({ assetId, objectKey: "original", sizeBytes: 2 }),
    ).rejects.toThrow("Incomplete IFC MCP cache copy");
    await expect(
      readFile(join(cacheDirectory, `${assetId}.ifc`)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
