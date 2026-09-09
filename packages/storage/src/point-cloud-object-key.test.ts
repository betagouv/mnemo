import { describe, expect, it } from "vitest";

import { buildPointCloudArtifactObjectKey } from "./point-cloud-object-key";

describe("buildPointCloudArtifactObjectKey", () => {
  it("keeps Potree artifacts under the server-owned asset prefix", () => {
    expect(
      buildPointCloudArtifactObjectKey({
        projectId: "project-id",
        assetId: "asset-id",
        name: "octree.bin",
      }),
    ).toBe("projects/project-id/assets/asset-id/derived/potree-v2/octree.bin");
  });
});
