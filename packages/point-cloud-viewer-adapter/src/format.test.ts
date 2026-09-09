import { describe, expect, it } from "vitest";

import { detectPointCloudFormat } from "./format";

describe("detectPointCloudFormat", () => {
  it.each([
    ["scan.las", "las"],
    ["SCAN.LAZ", "laz"],
    ["building.ply", "ply"],
    ["capture.e57", "e57"],
  ] as const)("maps %s to %s", (fileName, expected) => {
    expect(detectPointCloudFormat(fileName)).toBe(expected);
  });

  it("rejects extensions outside the supported upload contract", () => {
    expect(detectPointCloudFormat("scan.xyz")).toBeNull();
    expect(detectPointCloudFormat("scan")).toBeNull();
  });
});
