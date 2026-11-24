import type { MeshData, SpatialAffineTransform } from "@ifc-lite/geometry";
import { expect, it } from "vitest";

import { createScenePlacement, projectOrigin } from "./scene-placement";

const quarterTurn: SpatialAffineTransform = {
  m00: 0,
  m01: 0,
  m02: 1,
  tx: 652310,
  m10: 0,
  m11: 1,
  m12: 0,
  ty: 42,
  m20: -1,
  m21: 0,
  m22: 0,
  tz: -6862414,
};
const mesh = {
  expressId: 1,
  positions: new Float32Array([0.001, 0.002, 0.003]),
  normals: new Float32Array([1, 0, 0]),
  indices: new Uint32Array([0]),
  color: [1, 1, 1, 1],
  origin: [1, 2, 3],
} as unknown as MeshData;
const zero = { x: 0, y: 0, z: 0 };

it("leaves the meshes of an unmoved model untouched", () => {
  const rtc = { x: 652000, y: 6862000, z: 30 };
  const placement = createScenePlacement(null, rtc, projectOrigin(null, rtc));
  expect(placement.moves).toBe(false);
  expect(placement.place(mesh)).toBe(mesh);
});

it("keeps vertices bit-identical when only the render origin differs", () => {
  const placed = createScenePlacement(
    null,
    { x: 652310, y: 6862414, z: 42 },
    zero,
  ).place(mesh);
  expect(placed.positions).toBe(mesh.positions);
  expect(placed.origin).toEqual([652311, 44, -6862411]);
});

it("turns vertices around their own origin to keep sub-millimetre detail", () => {
  const origin = projectOrigin(quarterTurn, zero);
  expect(origin).toEqual({ x: 652310, y: 6862414, z: 42 });
  const placement = createScenePlacement(quarterTurn, zero, origin);
  const placed = placement.place(mesh);
  expect(placed.origin).toEqual([3, 2, -1]);
  [0.003, 0.002, -0.001].forEach((value, axis) =>
    expect(placed.positions[axis]).toBeCloseTo(value, 9),
  );
  expect(placed.normals[2]).toBe(-1);
  expect(mesh.positions[0]).toBeCloseTo(0.001, 9);
  expect(placement.elevation(7)).toBeCloseTo(7, 9);
});
