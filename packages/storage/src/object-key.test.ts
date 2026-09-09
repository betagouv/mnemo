import { describe, expect, it } from "vitest";

import { buildOriginalObjectKey } from "./object-key";

describe("buildOriginalObjectKey", () => {
  it("uses server identifiers and retains only a safe extension", () => {
    expect(
      buildOriginalObjectKey({
        projectId: "project-id",
        assetId: "asset-id",
        fileName: "../../Relevé final.LAZ",
      }),
    ).toBe("projects/project-id/assets/asset-id/original.laz");
  });

  it("does not expose an extension-less user file name", () => {
    expect(
      buildOriginalObjectKey({
        projectId: "project-id",
        assetId: "asset-id",
        fileName: "sensitive building name",
      }),
    ).toBe("projects/project-id/assets/asset-id/original.bin");
  });
});
