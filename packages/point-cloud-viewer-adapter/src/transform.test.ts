import { describe, expect, it } from "vitest";

import { composePointCloudTransform } from "./transform";

function transformPoint(
  matrix: Float32Array,
  [x, y, z]: [number, number, number],
) {
  return [
    matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
  ].map((value) => Math.round(value * 1_000_000) / 1_000_000);
}

describe("composePointCloudTransform", () => {
  it("combines scale and translation in a column-major GPU matrix", () => {
    const matrix = composePointCloudTransform({
      position: [10, 20, 30],
      rotationDegrees: [0, 0, 0],
      scale: [2, 3, 4],
    });

    expect(transformPoint(matrix, [1, 1, 1])).toEqual([12, 23, 34]);
  });

  it("maps a Z-up scan to positive Y with the -90 degree X default", () => {
    const matrix = composePointCloudTransform({
      position: [0, 0, 0],
      rotationDegrees: [-90, 0, 0],
      scale: [1, 1, 1],
    });

    expect(transformPoint(matrix, [0, 0, 1])).toEqual([0, 1, 0]);
  });
});
