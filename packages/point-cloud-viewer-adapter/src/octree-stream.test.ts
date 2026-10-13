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
  // Potree often stores the coarse root after its detailed descendants.
  view.setBigUint64(6, BigInt(12), true);
  view.setBigUint64(14, BigInt(12), true);

  view.setUint8(22, 1);
  view.setUint8(23, 0);
  view.setUint32(24, 1, true);
  view.setBigUint64(28, BigInt(0), true);
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
    const swaps: Array<{
      add: string[];
      remove: string[];
      points: number;
      complete: boolean;
    }> = [];
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
      onSwap: ({ add, remove, pointCount, complete }) => {
        swaps.push({
          add: add.map((node) => node.nodeId),
          remove,
          points: pointCount,
          complete,
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

    expect(swaps).toEqual([
      { add: ["r"], remove: [], points: 1, complete: false },
      { add: ["r0"], remove: [], points: 2, complete: false },
      { add: [], remove: [], points: 2, complete: true },
    ]);
    expect(ranges).toEqual(["bytes=0-43", "bytes=12-23", "bytes=0-11"]);

    const view = {
      viewProjectionMatrix: identity,
      modelMatrix: identity,
      cameraPosition: [0, 0, -2] as [number, number, number],
      verticalFovRadians: Math.PI / 3,
      viewportHeight: 800,
    };
    stream.update({ ...view, pointBudget: 1 });
    await vi.waitFor(() => expect(swaps.at(-1)?.remove).toEqual(["r0"]));
    const swapCount = swaps.length;
    stream.update({ ...view, pointBudget: 2 });
    await vi.waitFor(() =>
      expect(
        swaps.slice(swapCount).some((swap) => swap.add.includes("r0")),
      ).toBe(true),
    );
    expect(ranges).toEqual(["bytes=0-43", "bytes=12-23", "bytes=0-11"]);
    stream.cancel();
  });

  it("loads separate ranges concurrently and displays detail before the last range finishes", async () => {
    const hierarchy = new ArrayBuffer(22 * 7);
    const hierarchyView = new DataView(hierarchy);
    hierarchyView.setUint8(0, 0);
    hierarchyView.setUint8(1, 0b00111111);
    hierarchyView.setUint32(2, 1, true);
    hierarchyView.setBigUint64(6, BigInt(0), true);
    hierarchyView.setBigUint64(14, BigInt(12), true);
    for (let index = 0; index < 6; index++) {
      const record = 22 * (index + 1);
      hierarchyView.setUint8(record, 1);
      hierarchyView.setUint32(record + 2, 1, true);
      hierarchyView.setBigUint64(record + 6, BigInt(24 * (index + 1)), true);
      hierarchyView.setBigUint64(record + 14, BigInt(12), true);
    }
    const octree = new ArrayBuffer(24 * 7);
    const swaps: number[] = [];
    let activeRanges = 0;
    let peakRanges = 0;
    let abortedRanges = 0;
    let releaseConcurrentRanges: (() => void) | undefined;
    const concurrentRanges = new Promise<void>((resolve) => {
      releaseConcurrentRanges = resolve;
    });
    let releaseHeldRange: (() => void) | undefined;
    const heldRange = new Promise<void>((resolve) => {
      releaseHeldRange = resolve;
    });
    const fetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url);
        if (href.endsWith("metadata.json")) {
          return Response.json({
            version: "2.0",
            encoding: "DEFAULT",
            points: 7,
            spacing: 1,
            scale: [0.01, 0.01, 0.01],
            offset: [0, 0, 0],
            boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
            hierarchy: {
              firstChunkSize: hierarchy.byteLength,
              stepSize: 4,
              depth: 1,
            },
            attributes: [
              {
                name: "position",
                type: "int32",
                size: 12,
                numElements: 3,
                elementSize: 4,
              },
            ],
          });
        }
        const range = new Headers(init?.headers).get("range") ?? "";
        const match = /^bytes=(\d+)-(\d+)$/.exec(range);
        if (!match) return new Response(null, { status: 400 });
        const start = Number(match[1]);
        const end = Number(match[2]) + 1;
        if (href.endsWith("hierarchy.bin")) {
          return new Response(hierarchy.slice(start, end), { status: 206 });
        }
        activeRanges++;
        peakRanges = Math.max(peakRanges, activeRanges);
        if (start !== 0) await concurrentRanges;
        if (start === 24) {
          await Promise.race([
            heldRange,
            new Promise<never>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  abortedRanges++;
                  reject(new DOMException("Aborted", "AbortError"));
                },
                { once: true },
              );
            }),
          ]);
        }
        activeRanges--;
        return new Response(octree.slice(start, end), { status: 206 });
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
      onSwap: ({ pointCount }) => swaps.push(pointCount),
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

    const view = {
      viewProjectionMatrix: identity,
      modelMatrix: identity,
      cameraPosition: [0, 0, -2],
      verticalFovRadians: Math.PI / 3,
      viewportHeight: 800,
      pointBudget: 7,
    } as const;
    stream.update({ ...view, cameraPosition: [...view.cameraPosition] });
    await vi.waitFor(() => expect(peakRanges).toBeGreaterThan(4));
    releaseConcurrentRanges?.();
    await vi.waitFor(() => expect(swaps.length).toBeGreaterThan(0));
    expect(peakRanges).toBeGreaterThan(4);
    expect(swaps.at(-1)).toBeLessThan(7);

    stream.update({
      ...view,
      cameraPosition: [...view.cameraPosition],
      pointBudget: 1,
    });
    releaseHeldRange?.();
    await stream.ready;
    expect(swaps.at(-1)).toBe(1);
    expect(swaps).not.toContain(7);
    expect(abortedRanges).toBeGreaterThan(0);
    stream.update({ ...view, cameraPosition: [...view.cameraPosition] });
    await vi.waitFor(() => expect(swaps.at(-1)).toBe(7));
    stream.cancel();
  });
});
