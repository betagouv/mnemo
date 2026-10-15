import type { LodCamera } from "@ifc-lite/pointcloud";

import type { PointCloudLodView } from "./lod-types";

function multiply4(a: ArrayLike<number>, b: ArrayLike<number>) {
  const out = new Float64Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let inner = 0; inner < 4; inner += 1) {
        out[column * 4 + row] += a[inner * 4 + row] * b[column * 4 + inner];
      }
    }
  }
  return out;
}

function inverseAffinePoint(
  matrix: ArrayLike<number>,
  point: readonly [number, number, number],
) {
  const determinant =
    matrix[0] * (matrix[5] * matrix[10] - matrix[9] * matrix[6]) -
    matrix[4] * (matrix[1] * matrix[10] - matrix[9] * matrix[2]) +
    matrix[8] * (matrix[1] * matrix[6] - matrix[5] * matrix[2]);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-18)
    return null;
  const [x, y, z] = [
    point[0] - matrix[12],
    point[1] - matrix[13],
    point[2] - matrix[14],
  ];
  return [
    ((matrix[5] * matrix[10] - matrix[9] * matrix[6]) * x +
      (matrix[8] * matrix[6] - matrix[4] * matrix[10]) * y +
      (matrix[4] * matrix[9] - matrix[8] * matrix[5]) * z) /
      determinant,
    ((matrix[9] * matrix[2] - matrix[1] * matrix[10]) * x +
      (matrix[0] * matrix[10] - matrix[8] * matrix[2]) * y +
      (matrix[8] * matrix[1] - matrix[0] * matrix[9]) * z) /
      determinant,
    ((matrix[1] * matrix[6] - matrix[5] * matrix[2]) * x +
      (matrix[4] * matrix[2] - matrix[0] * matrix[6]) * y +
      (matrix[0] * matrix[5] - matrix[4] * matrix[1]) * z) /
      determinant,
  ] as [number, number, number];
}

/** Move the world camera into the decoded COPC frame before culling. */
export function copcLodCamera(view: PointCloudLodView): LodCamera | null {
  const position = inverseAffinePoint(view.modelMatrix, view.cameraPosition);
  if (!position) return null;
  const viewProj = multiply4(view.viewProjectionMatrix, view.modelMatrix);
  const scale = Math.max(
    Math.hypot(view.modelMatrix[0], view.modelMatrix[1], view.modelMatrix[2]),
    Math.hypot(view.modelMatrix[4], view.modelMatrix[5], view.modelMatrix[6]),
    Math.hypot(view.modelMatrix[8], view.modelMatrix[9], view.modelMatrix[10]),
  );
  return {
    viewProj,
    position,
    viewportHeight: view.viewportHeight,
    projScaleY: view.orthographicHeight
      ? (2 / view.orthographicHeight) * scale
      : 1 / Math.tan(view.verticalFovRadians / 2),
    orthographic: Boolean(view.orthographicHeight),
  };
}
