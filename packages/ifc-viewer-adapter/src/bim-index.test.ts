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
  it("locates a selected element without enumerating its class or changing a page", () => {
    const index = createIfcBimIndex(createStore(), [1, 2, 3]);
    expect(index.getElement(3)).toEqual({
      expressId: 3,
      globalId: "global-3",
      ifcClass: "IfcWall",
      name: "Mur N2",
      storeyId: 200,
    });
    expect(index.getElement(100)).toBeNull();
    expect(index.getElement(999)).toBeNull();
  });

  it("can locate an element outside the first page, including one without a storey", () => {
    const index = createIfcBimIndex(
      createStore(),
      Array.from({ length: 80 }, (_, i) => i + 300),
    );
    expect(index.queryPage(null, 0, 50)).toHaveLength(50);
    expect(index.getElement(379)).toMatchObject({
      expressId: 379,
      storeyId: null,
    });
    expect(index.queryPage(null, 0, 50)).toHaveLength(50);
  });

  it("lists renderable classes and storeys", () => {
    const index = createIfcBimIndex(createStore(), [1, 2, 3]);

    expect(index.catalog.types).toEqual([
      { ifcClass: "IfcDoor", elementCount: 1 },
      { ifcClass: "IfcWall", elementCount: 2 },
    ]);
    expect(index.catalog.unassignedCount).toBe(0);
    expect(index.classesForStorey(100)).toEqual([
      { ifcClass: "IfcDoor", elementCount: 1 },
      { ifcClass: "IfcWall", elementCount: 1 },
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

    expect(
      index.findIds({ ifcClasses: ["IfcWall"], storeyIds: [100] }),
    ).toEqual([1]);
    expect(index.query({ ifcClasses: ["IfcDoor"], storeyIds: [100] })).toEqual([
      {
        expressId: 2,
        globalId: "global-2",
        ifcClass: "IfcDoor",
        name: "Porte N1",
        storeyId: 100,
      },
    ]);
  });

  it("pages a storey without building the whole element tree", () => {
    const index = createIfcBimIndex(createStore(), [1, 2, 3]);
    const page = index.queryPage(100, 1, 1);

    expect(page).toMatchObject([{ expressId: 2, name: "Porte N1" }]);
    expect(index.queryPage(100, 1, 1)).toBe(page);
    expect(index.queryPage(null, 0, 100)).toEqual([]);
    expect(index.queryPage(100, 0, 100, "IfcWall")).toMatchObject([
      { expressId: 1, ifcClass: "IfcWall" },
    ]);
  });

  it("unions selected classes and levels, then intersects both criteria", () => {
    const index = createIfcBimIndex(createStore(), [1, 2, 3]);
    expect(
      index.findIds({ ifcClasses: ["IfcWall", "IfcDoor"] }).sort(),
    ).toEqual([1, 2, 3]);
    expect(
      index
        .findIds({ ifcClasses: ["IfcWall", "IfcDoor"], storeyIds: [100] })
        .sort(),
    ).toEqual([1, 2]);
    expect(
      index.findIds({ ifcClasses: ["IfcWall"], storeyIds: [100, 200] }),
    ).toEqual([1, 3]);
    expect(index.findIds({ storeyIds: [100, 100, 200] })).toEqual([1, 2, 3]);
    expect(index.findIds({ ifcClasses: ["IfcWall", "IfcWall"] })).toEqual([
      1, 3,
    ]);
    expect(
      index.findIds({ ifcClasses: ["IfcDoor"], storeyIds: [200] }),
    ).toEqual([]);
  });

  it("counts renderable matches using the existing class/storey counts", () => {
    const index = createIfcBimIndex(createStore(), [1, 2, 3]);
    for (const query of [
      {},
      { ifcClasses: [], storeyIds: [] },
      { ifcClasses: ["IfcWall"] },
      { ifcClasses: ["IfcWall", "IfcDoor"], storeyIds: [100] },
      { storeyIds: [100, 100, 200] },
      { ifcClasses: ["IfcDoor"], storeyIds: [200] },
    ])
      expect(index.count(query)).toBe(index.findIds(query).length);
    const partial = createIfcBimIndex(createStore(), [1, 3]);
    expect(partial.count({ ifcClasses: ["IfcDoor"] })).toBe(0);
    expect(partial.findIds({ ifcClasses: ["IfcDoor"] })).toEqual([]);
  });

  it("groups unassigned elements even when their IFC class is unavailable", () => {
    const index = createIfcBimIndex(createStore(), [1, 2, 3, 4]);

    expect(index.classesForStorey(null)).toEqual([
      { ifcClass: "IfcEntity", elementCount: 1 },
    ]);
    expect(index.queryPage(null, 0, 50, "IfcEntity")).toMatchObject([
      { expressId: 4, ifcClass: "IfcEntity" },
    ]);
    expect(index.count({ ifcClasses: ["IfcEntity"] })).toBe(1);
    expect(index.findIds({ ifcClasses: ["IfcEntity"] })).toEqual([4]);
  });
});
