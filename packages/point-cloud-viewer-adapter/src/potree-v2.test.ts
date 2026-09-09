import { describe, expect, it } from "vitest";

import {
  createPotreeRoot,
  decodePotreeNode,
  parsePotreeHierarchyPage,
  parsePotreeV2Metadata,
} from "./potree-v2";

function metadata() {
  return parsePotreeV2Metadata({
    version: "2.0",
    encoding: "DEFAULT",
    points: 3,
    spacing: 1,
    scale: [0.01, 0.01, 0.01],
    offset: [100, 200, 300],
    boundingBox: { min: [100, 200, 300], max: [108, 208, 308] },
    hierarchy: { firstChunkSize: 44, stepSize: 4, depth: 1 },
    attributes: [
      {
        name: "position",
        type: "int32",
        size: 12,
        numElements: 3,
        elementSize: 4,
      },
      {
        name: "rgb",
        type: "uint16",
        size: 6,
        numElements: 3,
        elementSize: 2,
      },
    ],
  });
}

describe("Potree 2 protocol", () => {
  it("parses a breadth-first hierarchy page and child bounds", () => {
    const root = createPotreeRoot(metadata());
    const page = new ArrayBuffer(44);
    const view = new DataView(page);
    view.setUint8(0, 0);
    view.setUint8(1, 1);
    view.setUint32(2, 2, true);
    view.setBigUint64(6, 0n, true);
    view.setBigUint64(14, 36n, true);
    view.setUint8(22, 1);
    view.setUint8(23, 0);
    view.setUint32(24, 1, true);
    view.setBigUint64(28, 36n, true);
    view.setBigUint64(36, 18n, true);

    parsePotreeHierarchyPage(root, page);

    expect(root).toMatchObject({ nodeType: 0, numPoints: 2, byteSize: 36n });
    expect(root.children[0]).toMatchObject({
      name: "r0",
      nodeType: 1,
      numPoints: 1,
      bounds: { min: [0, 0, 0], max: [4, 4, 4] },
    });
  });

  it("decodes root-local positions and RGB without retaining the source buffer", () => {
    const source = new ArrayBuffer(36);
    const view = new DataView(source);
    view.setInt32(0, 0, true);
    view.setInt32(4, 0, true);
    view.setInt32(8, 0, true);
    view.setUint16(12, 65_535, true);
    view.setUint16(14, 0, true);
    view.setUint16(16, 32_768, true);
    view.setInt32(18, 100, true);
    view.setInt32(22, 200, true);
    view.setInt32(26, 300, true);
    view.setUint16(30, 255, true);
    view.setUint16(32, 128, true);
    view.setUint16(34, 0, true);

    const decoded = decodePotreeNode(source, metadata(), {
      numPoints: 2,
      bounds: { min: [0, 0, 0], max: [8, 8, 8] },
    });

    expect([...decoded.positions]).toEqual([0, 0, 0, 1, 2, 3]);
    expect(decoded.colors?.[0]).toBe(1);
    expect(decoded.colors?.[1]).toBe(0);
    expect(decoded.colors?.[2]).toBeCloseTo(0.502, 2);
    expect(decoded.bbox).toEqual({ min: [0, 0, 0], max: [1, 2, 3] });
  });
});
