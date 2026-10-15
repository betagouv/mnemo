import { describe, expect, it, vi } from "vitest";

import { PointCloudSourceService } from "./point-cloud-source-service";

const input = {
  projectId: "d14ccec4-b8c9-437e-89af-0690c9c9682b",
  assetId: "95378a63-f613-46ce-ac24-3b7ea5a40ace",
};

function record(
  result: null | {
    format: "copc-v1";
    copcObjectKey: string;
    pointCount: number;
    spacing: number;
  },
  originalFileName = "scan.laz",
) {
  return {
    asset: {
      id: input.assetId,
      kind: "point_cloud" as const,
      status: "ready" as const,
      originalFileName,
      originalObjectKey: "original.laz",
    },
    result,
  };
}

describe("PointCloudSourceService", () => {
  it("signs exactly one COPC object without exposing S3 credentials", async () => {
    const createDownloadUrl = vi.fn(
      async ({ objectKey }) => `http://storage/${objectKey}`,
    );
    const service = new PointCloudSourceService(
      {
        findForActor: vi.fn().mockResolvedValue(
          record({
            format: "copc-v1",
            copcObjectKey: "cloud.copc.laz",
            pointCount: 1_800,
            spacing: 0.15,
          }),
        ),
      },
      { createDownloadUrl },
    );

    await expect(service.open("actor-id", input)).resolves.toMatchObject({
      mode: "copc",
      copcUrl: "http://storage/cloud.copc.laz",
      pointCount: 1_800,
    });
    expect(createDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it("falls back to the bounded E57 preview without COPC", async () => {
    const service = new PointCloudSourceService(
      { findForActor: vi.fn().mockResolvedValue(record(null, "scan.e57")) },
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

  it("does not download a full LAS/LAZ when its COPC result is missing", async () => {
    const createDownloadUrl = vi.fn();
    const service = new PointCloudSourceService(
      { findForActor: vi.fn().mockResolvedValue(record(null)) },
      { createDownloadUrl },
    );

    await expect(service.open("actor-id", input)).rejects.toThrow(
      "retraité en COPC",
    );
    expect(createDownloadUrl).not.toHaveBeenCalled();
  });
});
