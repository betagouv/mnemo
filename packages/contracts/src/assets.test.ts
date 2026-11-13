import { describe, expect, it } from "vitest";

import {
  assetSummarySchema,
  openAssetResultSchema,
  processingProgressSchema,
} from "./assets";

describe("asset contracts", () => {
  it("validates a point-cloud asset response", () => {
    expect(
      assetSummarySchema.parse({
        id: "2dc84044-62d6-4e2d-99ae-a8db4446b271",
        projectId: "8017a38c-385e-4ef4-87da-7cc1fb2a5e3b",
        kind: "point_cloud",
        originalFileName: "releve.laz",
        mediaType: "application/octet-stream",
        sizeBytes: 42_000,
        status: "uploaded",
        errorMessage: null,
        createdAt: "2026-09-09T10:00:00.000Z",
        updatedAt: "2026-09-09T10:00:00.000Z",
      }).kind,
    ).toBe("point_cloud");
  });

  it("validates the short-lived asset read contract", () => {
    const asset = assetSummarySchema.parse({
      id: "2dc84044-62d6-4e2d-99ae-a8db4446b271",
      projectId: "8017a38c-385e-4ef4-87da-7cc1fb2a5e3b",
      kind: "ifc",
      originalFileName: "model.ifc",
      mediaType: "application/x-step",
      sizeBytes: 42_000,
      status: "ready",
      errorMessage: null,
      createdAt: "2026-09-09T10:00:00.000Z",
      updatedAt: "2026-09-09T10:00:00.000Z",
    });

    expect(
      openAssetResultSchema.parse({
        asset,
        downloadUrl: "http://storage.local/model.ifc?signature=test",
        expiresAt: "2026-09-09T10:05:00.000Z",
      }).asset.id,
    ).toBe(asset.id);
  });
});

it("bounds processing progress and rejects unknown phases and metadata", () => {
  const progress = {
    phase: "converting",
    percent: 42,
    updatedAt: "2026-11-13T12:00:00.000Z",
  };
  expect(processingProgressSchema.parse(progress)).toEqual(progress);
  for (const invalid of [
    { ...progress, percent: -1 },
    { ...progress, percent: 101 },
    { ...progress, percent: 0.5 },
    { ...progress, phase: "unknown" },
    { ...progress, updatedAt: "yesterday" },
    { ...progress, objectKey: "private" },
  ])
    expect(processingProgressSchema.safeParse(invalid).success).toBe(false);
});
