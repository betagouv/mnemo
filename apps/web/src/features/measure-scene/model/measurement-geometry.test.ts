import { describe, expect, it } from "vitest";
import {
  distanceBetween,
  formatMeasurement,
  surfaceArea,
  type Point3,
} from "./measurement-geometry";

const rectangle = [
  { x: 0, y: 0, z: 0 },
  { x: 4, y: 0, z: 0 },
  { x: 4, y: 3, z: 0 },
  { x: 0, y: 3, z: 0 },
];

describe("scene measurements", () => {
  it("measures true 3D distances in model metres", () => {
    expect(
      distanceBetween({ x: 100, y: 20, z: -4 }, { x: 103, y: 24, z: 8 }),
    ).toBe(13);
  });
  it("measures horizontal, vertical and tilted surfaces in either winding", () => {
    for (const points of [
      rectangle,
      [...rectangle].reverse(),
      rectangle.map(({ x, y, z }) => ({ x, y: z, z: y })),
    ]) {
      expect(surfaceArea(points)).toEqual({ value: 12 });
    }
    const tilted = rectangle.map(({ x, y }) => ({
      x,
      y: y / Math.sqrt(2),
      z: y / Math.sqrt(2),
    }));
    expect(surfaceArea(tilted)).toEqual({ value: expect.closeTo(12, 9) });
  });
  it("preserves georeferenced coordinate precision", () => {
    expect(
      surfaceArea(
        rectangle.map(({ x, y, z }) => ({
          x: x + 700000,
          y: y + 6600000,
          z: z + 100,
        })),
      ),
    ).toEqual({ value: 12 });
  });
  it("handles a concave contour", () => {
    expect(
      surfaceArea([
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
        { x: 2, y: 1, z: 0 },
        { x: 4, y: 3, z: 0 },
        { x: 0, y: 3, z: 0 },
      ]),
    ).toEqual({ value: 9 });
  });
  it.each([
    rectangle.slice(0, 2),
    [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
    [rectangle[0]!, rectangle[2]!, rectangle[1]!, rectangle[3]!],
    [rectangle[0]!, rectangle[1]!, rectangle[1]!, rectangle[2]!, rectangle[3]!],
    [...rectangle.slice(0, 3), { x: 0, y: 3, z: 1 }],
  ])("rejects an invalid contour %j", (...points) => {
    expect(surfaceArea(points as Point3[])).toHaveProperty("error");
  });
  it("formats units and French decimals", () => {
    expect(formatMeasurement(1.23456, "distance")).toBe("1,235 m");
    expect(formatMeasurement(12, "surface")).toBe("12 m²");
  });
});
