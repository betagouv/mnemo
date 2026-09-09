import { describe, expect, it, vi } from "vitest";

import { createPointCloudOctreeStream } from "./octree-stream";
import { decodePotreeNode } from "./potree-v2";

const identity = new Float32Array([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

function hierarchyFixture() {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  view.setUint8(0, 0);
  view.setUint8(1, 1);
  view.setUint32(2, 1, true);
  view.setBigUint64(6, BigInt(0), true);
  view.setBigUint64(14, BigInt(12), true);

  view.setUint8(22, 1);
  view.setUint8(23, 0);
  view.setUint32(24, 1, true);
  view.setBigUint64(28, BigInt(12), true);
  view.setBigUint64(36, BigInt(12), true);
  return buffer;
}

function octreeFixture() {
  const buffer = new ArrayBuffer(24);
  const view = new DataView(buffer);
  view.setInt32(12, 100, true);
  return buffer;
}

describe("Potree octree stream", () => {
  it("loads additive LOD nodes with exact byte ranges", async () => {
    const hierarchy = hierarchyFixture();
    const octree = octreeFixture();
    const metadata = {
      version: "2.0",
      encoding: "DEFAULT",
      points: 2,
      spacing: 1,
      scale: [0.01, 0.01, 0.01],
      offset: [0, 0, 0],
      boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
      hierarchy: { firstChunkSize: 44, stepSize: 4, depth: 1 },
      attributes: [
        {
          name: "position",
          type: "int32",
          size: 12,
          numElements: 3,
          elementSize: 4,
        },
      ],
    };
    const ranges: string[] = [];
    const swaps: Array<{ add: string[]; remove: string[]; points: number }> =
      [];
    const fetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url);
        if (href.endsWith("metadata.json")) {
          return Response.json(metadata);
        }
        const range = new Headers(init?.headers).get("range") ?? "";
        ranges.push(range);
        const match = /^bytes=(\d+)-(\d+)$/.exec(range);
        if (!match) return new Response(null, { status: 400 });
        const start = Number(match[1]);
        const end = Number(match[2]) + 1;
        const source = href.endsWith("hierarchy.bin") ? hierarchy : octree;
        return new Response(source.slice(start, end), { status: 206 });
      },
    );

    const stream = createPointCloudOctreeStream({
      access: {
        metadataUrl: "https://storage.test/metadata.json",
        hierarchyUrl: "https://storage.test/hierarchy.bin",
        octreeUrl: "https://storage.test/octree.bin",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      refreshAccess: async () => {
        throw new Error("access should not refresh");
      },
      onSwap: ({ add, remove, pointCount }) => {
        swaps.push({
          add: add.map((node) => node.nodeId),
          remove,
          points: pointCount,
        });
      },
      runtime: {
        fetch: fetch as typeof globalThis.fetch,
        now: () => Date.parse("2026-09-09T12:00:00.000Z"),
        createDecoder: () => ({
          decode: async (buffer, parsedMetadata, node) =>
            decodePotreeNode(buffer, parsedMetadata, node),
          close: vi.fn(),
        }),
      },
    });

    stream.update({
      viewProjectionMatrix: identity,
      modelMatrix: identity,
      cameraPosition: [0, 0, -2],
      verticalFovRadians: Math.PI / 3,
      viewportHeight: 800,
      pointBudget: 2,
    });
    await stream.ready;

    expect(swaps).toEqual([{ add: ["r", "r0"], remove: [], points: 2 }]);
    expect(ranges).toEqual(["bytes=0-43", "bytes=0-11", "bytes=12-23"]);
    stream.cancel();
  });
});
