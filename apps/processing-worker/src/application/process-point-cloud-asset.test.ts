import { describe, expect, it, vi } from "vitest";

import {
  createProcessPointCloudAssetHandler,
  type PointCloudProcessingResult,
} from "./process-point-cloud-asset";

const job = {
  id: "job-id",
  assetId: "asset-id",
  type: "process_point_cloud" as const,
  attempt: 1,
  maxAttempts: 3,
};

const asset = {
  id: "asset-id",
  projectId: "project-id",
  originalFileName: "survey.laz",
  originalObjectKey: "projects/project/assets/asset/original.laz",
  sizeBytes: 42,
};

const result: PointCloudProcessingResult = {
  format: "potree-v2",
  processor: "PotreeConverter",
  processorVersion: "2.1.1",
  metadataObjectKey: "metadata.json",
  hierarchyObjectKey: "hierarchy.bin",
  octreeObjectKey: "octree.bin",
  pointCount: 1_000,
  spacing: 0.1,
};

describe("process point-cloud asset", () => {
  it("builds and persists a spatial octree after verifying the original", async () => {
    const saveResult = vi.fn(async () => true);
    const build = vi.fn().mockResolvedValue(result);
    const processedAt = new Date("2026-09-09T12:00:00.000Z");
    const handler = createProcessPointCloudAssetHandler({
      repository: {
        findPointCloudAsset: vi.fn().mockResolvedValue(asset),
        saveResult,
      },
      storage: {
        statObject: vi.fn().mockResolvedValue({ contentLength: 42 }),
      },
      artifacts: { build, remove: vi.fn() },
      now: () => processedAt,
    });

    await expect(handler(job)).resolves.toBeUndefined();
    expect(build).toHaveBeenCalledWith(asset);
    expect(saveResult).toHaveBeenCalledWith("asset-id", result, processedAt);
  });

  it("keeps unsupported formats on the bounded preview path", async () => {
    const saveResult = vi.fn(async () => true);
    const handler = createProcessPointCloudAssetHandler({
      repository: {
        findPointCloudAsset: vi
          .fn()
          .mockResolvedValue({ ...asset, originalFileName: "scan.e57" }),
        saveResult,
      },
      storage: {
        statObject: vi.fn().mockResolvedValue({ contentLength: 42 }),
      },
      artifacts: {
        build: vi.fn().mockResolvedValue(null),
        remove: vi.fn(),
      },
    });

    await handler(job);
    expect(saveResult).not.toHaveBeenCalled();
  });

  it("fails when the original object is incomplete", async () => {
    const build = vi.fn();
    const handler = createProcessPointCloudAssetHandler({
      repository: {
        findPointCloudAsset: vi.fn().mockResolvedValue(asset),
        saveResult: vi.fn().mockResolvedValue(true),
      },
      storage: {
        statObject: vi.fn().mockResolvedValue({ contentLength: 12 }),
      },
      artifacts: { build, remove: vi.fn() },
    });

    await expect(handler(job)).rejects.toThrow("missing or incomplete");
    expect(build).not.toHaveBeenCalled();
  });

  it("removes published artifacts if deletion won the database race", async () => {
    const remove = vi.fn(async () => undefined);
    const handler = createProcessPointCloudAssetHandler({
      repository: {
        findPointCloudAsset: vi.fn().mockResolvedValue(asset),
        saveResult: vi.fn().mockResolvedValue(false),
      },
      storage: {
        statObject: vi.fn().mockResolvedValue({ contentLength: 42 }),
      },
      artifacts: { build: vi.fn().mockResolvedValue(result), remove },
    });

    await handler(job);
    expect(remove).toHaveBeenCalledWith(result);
  });
});
