import { describe, expect, it } from "vitest";

import { canUploadAsset, supportsAssetFile } from "./asset";

describe("asset rules", () => {
  it.each([
    ["ifc", "model.IFC"],
    ["ifc", "archive.ifczip"],
    ["point_cloud", "survey.las"],
    ["point_cloud", "survey.laz"],
    ["point_cloud", "mesh.ply"],
    ["point_cloud", "scan.e57"],
  ] as const)("accepts %s file %s", (kind, fileName) => {
    expect(supportsAssetFile(kind, fileName)).toBe(true);
  });

  it("does not accept a point-cloud extension as an IFC", () => {
    expect(supportsAssetFile("ifc", "survey.laz")).toBe(false);
  });

  it("keeps viewers from uploading project assets", () => {
    expect(canUploadAsset("owner")).toBe(true);
    expect(canUploadAsset("editor")).toBe(true);
    expect(canUploadAsset("viewer")).toBe(false);
  });
});
