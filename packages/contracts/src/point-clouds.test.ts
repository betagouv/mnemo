import { describe, expect, it } from "vitest";

import {
  pointCloudSourceSchema,
  updatePointCloudSettingsInputSchema,
} from "./point-clouds";

const validInput = {
  projectId: "d14ccec4-b8c9-437e-89af-0690c9c9682b",
  assetId: "95378a63-f613-46ce-ac24-3b7ea5a40ace",
  transform: {
    position: [1, 2, 3],
    rotationDegrees: [-90, 0, 15],
    scale: [1, 1, 1],
  },
  sourceCrs: "EPSG:2154",
  targetCrs: null,
};

describe("point-cloud contracts", () => {
  it("distinguishes bounded previews from camera-driven octrees", () => {
    expect(
      pointCloudSourceSchema.parse({
        mode: "octree",
        metadataUrl: "http://storage/metadata.json",
        hierarchyUrl: "http://storage/hierarchy.bin",
        octreeUrl: "http://storage/octree.bin",
        pointCount: 1_000_000,
        spacing: 0.1,
        expiresAt: "2026-09-09T12:00:00.000Z",
      }).mode,
    ).toBe("octree");
  });

  it("accepts a finite spatial transform and CRS metadata", () => {
    expect(updatePointCloudSettingsInputSchema.parse(validInput)).toEqual(
      validInput,
    );
  });

  it("rejects a singular transform", () => {
    expect(() =>
      updatePointCloudSettingsInputSchema.parse({
        ...validInput,
        transform: { ...validInput.transform, scale: [1, 0, 1] },
      }),
    ).toThrow();
  });
});
