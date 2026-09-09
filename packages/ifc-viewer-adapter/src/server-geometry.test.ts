import type { MeshData as ServerMeshData } from "@ifc-lite/server-client";
import { describe, expect, it } from "vitest";

import { toBrowserMeshBatch, toBrowserMeshData } from "./server-geometry";

function serverMesh(overrides: Partial<ServerMeshData> = {}): ServerMeshData {
  return {
    express_id: 42,
    ifc_type: "IfcWall",
    positions: new Float32Array([0, 0, 0]),
    normals: new Float32Array([0, 1, 0]),
    indices: new Uint32Array([0]),
    color: [0.4, 0.5, 0.6, 1],
    ...overrides,
  };
}

describe("server geometry adapter", () => {
  it("preserves local origins and IFC identity", () => {
    const mesh = toBrowserMeshData(
      serverMesh({
        origin: [1_000_000, 20, -50],
        geometry_class: 0,
        geometry_item_id: 73,
      }),
    );

    expect(mesh).toMatchObject({
      expressId: 42,
      ifcType: "IfcWall",
      origin: [1_000_000, 20, -50],
      geometryClass: 0,
      geometryItemId: 73,
    });
  });

  it("does not render type-library templates over their occurrences", () => {
    const meshes = toBrowserMeshBatch([
      serverMesh({ express_id: 1, geometry_class: 2 }),
      serverMesh({ express_id: 2, geometry_class: 0 }),
    ]);

    expect(meshes.map((mesh) => mesh.expressId)).toEqual([2]);
  });
});
