import { describe, expect, it } from "vitest";

import { draggedBoxFaceValue, sectionBoxFaces } from "./section-box-geometry";

describe("sectionBoxFaces", () => {
  const box = {
    min: [0, 2, 4] as [number, number, number],
    max: [10, 12, 14] as [number, number, number],
  };

  it("places six handles at the centers of the corresponding faces", () => {
    const faces = sectionBoxFaces(box);
    expect(faces).toHaveLength(6);
    expect(faces[0]).toMatchObject({
      axis: 0,
      side: "min",
      sign: -1,
      value: 0,
      center: { x: 0, y: 7, z: 9 },
    });
    expect(faces[1]).toMatchObject({
      axis: 0,
      side: "max",
      sign: 1,
      value: 10,
      center: { x: 10, y: 7, z: 9 },
    });
    expect(faces[3]?.corners.map((point) => point.y)).toEqual([12, 12, 12, 12]);
  });

  it("moves the min and max face in their outward direction", () => {
    expect(
      draggedBoxFaceValue(2, -1, { x: 20, y: 0 }, { x: 1, y: 0 }, 10),
    ).toBe(0);
    expect(
      draggedBoxFaceValue(12, 1, { x: 20, y: 0 }, { x: 1, y: 0 }, 10),
    ).toBe(14);
    expect(
      draggedBoxFaceValue(2, -1, { x: 20, y: 0 }, { x: 1, y: 0 }, 0),
    ).toBeNull();
  });
});
