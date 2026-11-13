import { describe, expect, it } from "vitest";
import type { IfcBimCatalog } from "@mnemo/ifc-viewer-adapter";
import { bimFilterLabel } from "./bim-filter";

const catalog: IfcBimCatalog = {
  types: [],
  unassignedCount: 0,
  storeys: [
    { expressId: 1, name: "RDC", elevation: 0, elementCount: 10 },
    { expressId: 2, name: "R+1", elevation: 3, elementCount: 10 },
    { expressId: 3, name: "R+2", elevation: 6, elementCount: 10 },
  ],
};

describe("BIM filter criteria", () => {
  it("describes combined classes and levels compactly", () => {
    expect(bimFilterLabel(catalog, {})).toBe("Toute la maquette");
    expect(
      bimFilterLabel(catalog, {
        ifcClasses: ["IfcWall", "IfcDoor"],
        storeyIds: [1],
      }),
    ).toBe("IfcWall, IfcDoor · RDC");
    expect(
      bimFilterLabel(catalog, {
        ifcClasses: ["IfcWall", "IfcDoor", "IfcSlab"],
        storeyIds: [1, 2, 3],
      }),
    ).toBe("IfcWall, IfcDoor, IfcSlab · RDC, R+1, R+2");
  });
});
