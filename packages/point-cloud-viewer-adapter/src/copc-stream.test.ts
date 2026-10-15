import { CopcHierarchy, type CopcWorkerReader } from "@ifc-lite/pointcloud";
import { describe, expect, it, vi } from "vitest";

import { createPointCloudCopcStream } from "./copc-stream";

const identity = new Float32Array([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

function header() {
  const bytes = new Uint8Array(589);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x4653414c, true);
  view.setUint8(24, 1);
  view.setUint8(25, 4);
  view.setUint16(94, 375, true);
  view.setUint8(104, 7);
  view.setUint16(105, 36, true);
  view.setBigUint64(247, 40n, true);
  for (const offset of [131, 139, 147]) view.setFloat64(offset, 0.01, true);
  for (const offset of [179, 195, 211]) view.setFloat64(offset, 1, true);
  return bytes;
}

describe("COPC range stream", () => {
  it("shows the root before camera LOD, then replaces it within the budget", async () => {
    const bytes = header();
    const hierarchy = new CopcHierarchy();
    hierarchy.nodes.set("0-0-0-0", {
      key: { d: 0, x: 0, y: 0, z: 0 },
      offset: 589,
      byteSize: 100,
      pointCount: 40,
    });
    const readNode = vi.fn(async (_entry, options?: { stride?: number }) => {
      const pointCount = Math.ceil(40 / (options?.stride ?? 1));
      return {
        positions: new Float32Array(pointCount * 3),
        pointCount,
        bbox: { min: [0, 0, 0], max: [1, 1, 1] },
        normalState: "absent" as const,
      };
    });
    const reader = {
      hierarchy,
      file: {
        header: { pointCount: 40 },
        info: { center: [0.5, 0.5, 0.5], halfsize: 0.5, spacing: 1 },
      },
      readNode,
      loadPage: vi.fn(),
      close: vi.fn(),
    } as unknown as CopcWorkerReader;
    const swaps: Array<{
      added: string[];
      removed: string[];
      points: number;
      complete: boolean;
    }> = [];
    const fetchRange = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("Range")).toBe("bytes=0-65535");
        return new Response(bytes, {
          status: 206,
          headers: {
            "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
          },
        });
      },
    );
    const stream = createPointCloudCopcStream({
      access: {
        copcUrl: "https://storage.test/cloud.copc.laz",
        expiresAt: "2099-01-01T00:00:00Z",
      },
      refreshAccess: async () => {
        throw new Error("unexpected refresh");
      },
      onSwap: ({ add, remove, pointCount, complete }) =>
        swaps.push({
          added: add.map((item) => item.nodeId),
          removed: remove,
          points: pointCount,
          complete,
        }),
      runtime: {
        fetch: fetchRange as typeof fetch,
        openReader: vi.fn(async () => reader),
        now: () => Date.parse("2026-10-13T12:00:00Z"),
      },
    });
    stream.update({
      viewProjectionMatrix: identity,
      modelMatrix: identity,
      cameraPosition: [0, 0, -2],
      verticalFovRadians: Math.PI / 3,
      viewportHeight: 800,
      pointBudget: 250_000,
    });
    await stream.ready;
    expect(swaps[0]).toMatchObject({
      added: ["0-0-0-0:root"],
      points: 40,
      complete: false,
    });
    expect(swaps.some((swap) => swap.removed.includes("0-0-0-0:root"))).toBe(
      true,
    );
    expect(swaps).toHaveLength(3);
    expect(swaps.at(-1)).toMatchObject({ points: 40, complete: true });
    expect(fetchRange).toHaveBeenCalledTimes(1);
    expect(readNode).toHaveBeenCalledTimes(2);

    const initialSwapCount = swaps.length;
    // Intermediate camera positions should not launch a new LOD pass.
    stream.update({
      viewProjectionMatrix: identity,
      modelMatrix: identity,
      cameraPosition: [0, 0, -3],
      verticalFovRadians: Math.PI / 3,
      viewportHeight: 800,
      pointBudget: 25,
    });
    stream.update({
      viewProjectionMatrix: identity,
      modelMatrix: identity,
      cameraPosition: [0, 0, -2],
      verticalFovRadians: Math.PI / 3,
      viewportHeight: 800,
      pointBudget: 250_000,
    });
    await vi.waitFor(() =>
      expect(swaps.filter((swap) => swap.complete)).toHaveLength(2),
    );
    expect(readNode).toHaveBeenCalledTimes(2);
    expect(
      swaps.slice(initialSwapCount).every((swap) => swap.points >= 20),
    ).toBe(true);

    stream.update({
      viewProjectionMatrix: identity,
      modelMatrix: identity,
      cameraPosition: [0, 0, -3],
      verticalFovRadians: Math.PI / 3,
      viewportHeight: 800,
      pointBudget: 25,
    });
    await vi.waitFor(() =>
      expect(swaps.filter((swap) => swap.complete)).toHaveLength(3),
    );
    expect(swaps.at(-1)).toMatchObject({ points: 20, complete: true });
    expect(readNode).toHaveBeenCalledTimes(3);

    // Returning to a previously visited LOD reuses the decoded node.
    stream.update({
      viewProjectionMatrix: identity,
      modelMatrix: identity,
      cameraPosition: [0, 0, -2],
      verticalFovRadians: Math.PI / 3,
      viewportHeight: 800,
      pointBudget: 250_000,
    });
    await vi.waitFor(() =>
      expect(swaps.filter((swap) => swap.complete)).toHaveLength(4),
    );
    expect(swaps.at(-1)).toMatchObject({ points: 40, complete: true });
    expect(readNode).toHaveBeenCalledTimes(3);
    expect(
      swaps.slice(initialSwapCount).every((swap) => swap.points >= 20),
    ).toBe(true);
    stream.cancel();
  });
});
