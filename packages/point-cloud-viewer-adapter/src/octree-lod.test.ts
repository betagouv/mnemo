import { describe, expect, it } from "vitest";

import { selectPointCloudLod } from "./octree-lod";
import type { PotreeNode } from "./potree-v2";

const identity = new Float32Array([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

function node(
  name: string,
  level: number,
  points: number,
  bounds: PotreeNode["bounds"],
): PotreeNode {
  return {
    name,
    level,
    spacing: 0.5 / 2 ** level,
    bounds,
    nodeType: 0,
    numPoints: points,
    byteOffset: 0n,
    byteSize: BigInt(points * 12),
    hierarchyByteOffset: 0n,
    hierarchyByteSize: 0n,
    children: [],
  };
}

describe("point-cloud octree LOD", () => {
  it("refines visible nodes within the point budget", () => {
    const root = node("r", 0, 100, { min: [-1, -1, 0], max: [1, 1, 1] });
    root.children[0] = node("r0", 1, 80, {
      min: [-1, -1, 0],
      max: [0, 0, 0.5],
    });
    root.children[7] = node("r7", 1, 90, {
      min: [0, 0, 0.5],
      max: [1, 1, 1],
    });

    const refined = selectPointCloudLod(root, {
      viewProjectionMatrix: identity,
      modelMatrix: identity,
      cameraPosition: [0, 0, -2],
      verticalFovRadians: Math.PI / 3,
      viewportHeight: 800,
      pointBudget: 200,
    });
    expect(refined.nodes.map((item) => item.name).sort()).toEqual(["r", "r0"]);
    expect(refined.pointCount).toBe(180);

    const bounded = selectPointCloudLod(root, {
      viewProjectionMatrix: identity,
      modelMatrix: identity,
      cameraPosition: [0, 0, -2],
      verticalFovRadians: Math.PI / 3,
      viewportHeight: 800,
      pointBudget: 120,
    });
    expect(bounded.nodes.map((item) => item.name)).toEqual(["r"]);
  });

  it("requests proxy hierarchy pages while retaining the parent sample", () => {
    const root = node("r", 0, 100, { min: [-1, -1, 0], max: [1, 1, 1] });
    const proxy = node("r0", 1, 80, {
      min: [-1, -1, 0],
      max: [0, 0, 0.5],
    });
    proxy.nodeType = 2;
    root.children[0] = proxy;

    const selection = selectPointCloudLod(root, {
      viewProjectionMatrix: identity,
      modelMatrix: identity,
      cameraPosition: [0, 0, -2],
      verticalFovRadians: Math.PI / 3,
      viewportHeight: 800,
      pointBudget: 1_000,
    });
    expect(selection.nodes).toEqual([root]);
    expect(selection.hierarchyPages).toEqual([proxy]);
  });
});
