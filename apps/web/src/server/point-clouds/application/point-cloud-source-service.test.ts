import { describe, expect, it, vi } from "vitest";

import { PointCloudSourceService } from "./point-cloud-source-service";

const input = {
  projectId: "d14ccec4-b8c9-437e-89af-0690c9c9682b",
  assetId: "95378a63-f613-46ce-ac24-3b7ea5a40ace",
};

function record(
  result: null | {
    metadataObjectKey: string;
    hierarchyObjectKey: string;
    octreeObjectKey: string;
    pointCount: number;
    spacing: number;
  },
) {
  return {
    asset: {
      id: input.assetId,
      kind: "point_cloud" as const,
      status: "ready" as const,
      originalObjectKey: "original.laz",
    },
    result,
  };
}

describe("PointCloudSourceService", () => {
  it("returns independent signed URLs for a persisted octree", async () => {
    const service = new PointCloudSourceService(
      {
        findForActor: vi.fn().mockResolvedValue(
          record({
            metadataObjectKey: "metadata.json",
            hierarchyObjectKey: "hierarchy.bin",
            octreeObjectKey: "octree.bin",
            pointCount: 2_000_000,
            spacing: 0.12,
          }),
        ),
      },
      {
        createDownloadUrl: async ({ objectKey }) =>
          `http://storage/${objectKey}`,
      },
      () => new Date("2026-09-09T12:00:00.000Z"),
    );

    await expect(service.open("actor-id", input)).resolves.toEqual({
      mode: "octree",
      metadataUrl: "http://storage/metadata.json",
      hierarchyUrl: "http://storage/hierarchy.bin",
      octreeUrl: "http://storage/octree.bin",
      pointCount: 2_000_000,
      spacing: 0.12,
      expiresAt: "2026-09-09T12:15:00.000Z",
    });
  });

  it("falls back to the bounded original preview without an octree", async () => {
    const service = new PointCloudSourceService(
      { findForActor: vi.fn().mockResolvedValue(record(null)) },
      {
        createDownloadUrl: async ({ objectKey }) =>
          `http://storage/${objectKey}`,
      },
    );

    await expect(service.open("actor-id", input)).resolves.toMatchObject({
      mode: "preview",
      downloadUrl: "http://storage/original.laz",
    });
  });
});
