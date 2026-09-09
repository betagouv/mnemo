import { describe, expect, it, vi } from "vitest";

import { createProcessPointCloudAssetHandler } from "./process-point-cloud-asset";

const job = {
  id: "job-id",
  assetId: "asset-id",
  type: "process_point_cloud" as const,
  attempt: 1,
  maxAttempts: 3,
};

describe("process point-cloud asset", () => {
  it("verifies that the original is complete before marking the job ready", async () => {
    const handler = createProcessPointCloudAssetHandler({
      repository: {
        findPointCloudAsset: vi.fn().mockResolvedValue({
          id: "asset-id",
          originalObjectKey: "projects/project/assets/asset/original.laz",
          sizeBytes: 42,
        }),
      },
      storage: {
        statObject: vi.fn().mockResolvedValue({ contentLength: 42 }),
      },
    });

    await expect(handler(job)).resolves.toBeUndefined();
  });

  it("fails when the original object is incomplete", async () => {
    const handler = createProcessPointCloudAssetHandler({
      repository: {
        findPointCloudAsset: vi.fn().mockResolvedValue({
          id: "asset-id",
          originalObjectKey: "projects/project/assets/asset/original.laz",
          sizeBytes: 42,
        }),
      },
      storage: {
        statObject: vi.fn().mockResolvedValue({ contentLength: 12 }),
      },
    });

    await expect(handler(job)).rejects.toThrow("missing or incomplete");
  });
});
