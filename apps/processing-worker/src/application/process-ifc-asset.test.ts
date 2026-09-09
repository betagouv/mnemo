import { describe, expect, it, vi } from "vitest";

import { createProcessIfcAssetHandler } from "./process-ifc-asset";

const processedAt = new Date("2026-09-09T16:00:00.000Z");
const result = {
  processor: "ifc-lite-server",
  processorVersion: "9.2.0",
  cacheKey: "sha256-default",
  entityCount: 1_500,
  geometryEntityCount: 420,
  meshCount: 73,
  cacheHit: false,
};

describe("process IFC asset", () => {
  it("reads the S3 original, warms IFC-Lite, and saves its cache reference", async () => {
    const saveResult = vi.fn();
    const readObject = vi.fn().mockResolvedValue(Uint8Array.of(1, 2, 3));
    const process = vi.fn().mockResolvedValue(result);
    const handler = createProcessIfcAssetHandler({
      repository: {
        findIfcAsset: vi.fn().mockResolvedValue({
          id: "asset-id",
          originalObjectKey: "projects/project-id/assets/asset-id/original.ifc",
        }),
        saveResult,
      },
      storage: { readObject },
      processor: { process },
      now: () => processedAt,
    });

    await handler({
      id: "job-id",
      assetId: "asset-id",
      type: "process_ifc",
      attempt: 1,
      maxAttempts: 3,
    });

    expect(readObject).toHaveBeenCalledWith(
      "projects/project-id/assets/asset-id/original.ifc",
    );
    expect(process).toHaveBeenCalledWith(Uint8Array.of(1, 2, 3));
    expect(saveResult).toHaveBeenCalledWith("asset-id", result, processedAt);
  });

  it("fails before touching storage when the asset was deleted", async () => {
    const readObject = vi.fn();
    const handler = createProcessIfcAssetHandler({
      repository: {
        findIfcAsset: vi.fn().mockResolvedValue(null),
        saveResult: vi.fn(),
      },
      storage: { readObject },
      processor: { process: vi.fn() },
    });

    await expect(
      handler({
        id: "job-id",
        assetId: "missing-asset",
        type: "process_ifc",
        attempt: 1,
        maxAttempts: 3,
      }),
    ).rejects.toThrow("IFC asset missing-asset does not exist");
    expect(readObject).not.toHaveBeenCalled();
  });
});
