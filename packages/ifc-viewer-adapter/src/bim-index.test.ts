import type { IfcDataStore } from "@ifc-lite/parser";
import { describe, expect, it } from "vitest";

import { createIfcBimIndex } from "./bim-index";

function createStore() {
  const types = new Map([
    [1, "IfcWall"],
    [2, "IfcDoor"],
    [3, "IfcWall"],
    [100, "IfcBuildingStorey"],
    [200, "IfcBuildingStorey"],
  ]);
  const names = new Map([
    [1, "Mur N1"],
    [2, "Porte N1"],
    [3, "Mur N2"],
    [100, "Niveau 1"],
    [200, "Niveau 2"],
  ]);

  return {
    entities: {
      getTypeName: (expressId: number) => types.get(expressId) ?? "",
      getName: (expressId: number) => names.get(expressId) ?? "",
      getGlobalId: (expressId: number) => `global-${expressId}`,
      getByType: (type: number) => {
        if (type === 10) return [1, 3];
        if (type === 12) return [2];
        return [];
      },
    },
    spatialHierarchy: {
      byStorey: new Map([
        [100, [1, 2]],
        [200, [3]],
      ]),
      storeyElevations: new Map([
        [100, 0],
        [200, 3.2],
      ]),
      elementToStorey: new Map([
        [1, 100],
        [2, 100],
        [3, 200],
      ]),
    },
  } as unknown as IfcDataStore;
}

describe("createIfcBimIndex", () => {
  it("lists renderable classes and storeys", () => {
    const index = createIfcBimIndex(createStore(), [1, 2, 3]);

    expect(index.catalog.types).toEqual([
      { ifcClass: "IfcDoor", elementCount: 1 },
      { ifcClass: "IfcWall", elementCount: 2 },
    ]);
    expect(index.catalog.storeys).toEqual([
      {
        expressId: 100,
        name: "Niveau 1",
        elevation: 0,
        elementCount: 2,
      },
      {
        expressId: 200,
        name: "Niveau 2",
        elevation: 3.2,
        elementCount: 1,
      },
    ]);
  });

  it("combines an IFC class and a building storey through IFC-Lite queries", () => {
    const index = createIfcBimIndex(createStore(), [1, 2, 3]);

    expect(index.findIds({ ifcClass: "IfcWall", storeyId: 100 })).toEqual([1]);
    expect(index.query({ ifcClass: "IfcDoor", storeyId: 100 })).toEqual([
      {
        expressId: 2,
        globalId: "global-2",
        ifcClass: "IfcDoor",
        name: "Porte N1",
        storeyId: 100,
      },
    ]);
  });
});
