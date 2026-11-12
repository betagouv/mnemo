import { describe, it, expect } from "vitest";
import {
  measurementToProject,
  measurementFromProject,
} from "./measurement-coordinates";

describe("persisted measurement coordinates", () => {
  it("restores the same IFC point after loading with a different render origin", () => {
    const origin = { x: 700000, y: 6600000, z: 100 };
    const point = { x: 2, y: 3, z: -4 };
    const absolute = measurementToProject(point, origin);
    expect(absolute).toEqual({ x: 700002, y: 6600004, z: 103 });
    expect(measurementFromProject(absolute, origin)).toEqual(point);
    const otherOrigin = { x: 699000, y: 6601000, z: 50 };
    expect(
      measurementToProject(
        measurementFromProject(absolute, otherOrigin),
        otherOrigin,
      ),
    ).toEqual(absolute);
  });
});
