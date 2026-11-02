import type { IfcDataStore } from "@ifc-lite/parser";
import type { FederationRegistry } from "@ifc-lite/renderer";
import { describe, expect, it } from "vitest";

import type { IfcBimIndex } from "./bim-index";
import { BimLayerVisibility } from "./bim-layer-visibility";

function setup(incompleteStoreyQuery = false) {
  const elements = [
    { expressId: 1, storeyId: 10, ifcClass: "IfcWall" },
    { expressId: 2, storeyId: 10, ifcClass: "IfcWall" },
    { expressId: 3, storeyId: 10, ifcClass: "IfcDoor" },
    { expressId: 4, storeyId: 20, ifcClass: "IfcWall" },
    { expressId: 5, storeyId: null, ifcClass: "IfcWall" },
  ];
  const store = {
    entities: {
      getTypeName: (id: number) =>
        elements.find((e) => e.expressId === id)?.ifcClass,
    },
    spatialHierarchy: {
      elementToStorey: new Map(
        elements
          .filter((e) => e.storeyId !== null)
          .map((e) => [e.expressId, e.storeyId]),
      ),
    },
  } as unknown as IfcDataStore;
  const index = {
    catalog: { storeys: [{ expressId: 10 }, { expressId: 20 }] },
    findIds: ({ storeyId }: { storeyId: number }) =>
      elements
        .filter(
          (e) =>
            e.storeyId === storeyId &&
            (!incompleteStoreyQuery || e.expressId !== 2),
        )
        .map((e) => e.expressId),
    classesForStorey: (storeyId: number | null) =>
      ["IfcWall", "IfcDoor"].map((ifcClass) => ({
        ifcClass,
        elementCount: elements.filter(
          (e) => e.storeyId === storeyId && e.ifcClass === ifcClass,
        ).length,
      })),
    queryPage: (
      storeyId: number | null,
      _offset: number,
      _limit: number,
      ifcClass: string,
    ) =>
      elements.filter(
        (e) => e.storeyId === storeyId && e.ifcClass === ifcClass,
      ),
  } as unknown as IfcBimIndex;
  const federation = {
    fromGlobalId: (id: number) => ({ modelId: "a", expressId: id }),
    toGlobalId: (_assetId: string, id: number) => id,
  } as unknown as FederationRegistry;
  return new BimLayerVisibility(
    new Map([
      ["a", { store, bimIndex: index, meshIds: new Set([1, 2, 3, 4, 5]) }],
    ]),
    federation,
  );
}

const model = { kind: "model" } as const;
const storey = { kind: "storey", expressId: 10 } as const;
const walls = { kind: "class", storeyId: 10, ifcClass: "IfcWall" } as const;

describe("CAD tree visibility", () => {
  it("keeps a storey uniform even when the query index omits a mapped descendant", () => {
    const visibility = setup(true);
    visibility.set("a", storey, "opacity");
    expect(visibility.get("a", storey)).toBe("opacity");
    expect(visibility.exceptionCount("a", storey)).toBe(0);
    expect(visibility.get("a", { kind: "element", expressId: 2 })).toBe(
      "opacity",
    );
    visibility.set("a", storey, "hide");
    expect([...visibility.hiddenIds].sort()).toEqual([1, 2, 3]);
    expect(visibility.exceptionCount("a", storey)).toBe(0);
  });

  it("restores all descendants when a model is shown, including hidden and transparent overrides", () => {
    const visibility = setup();
    visibility.set("a", storey, "hide");
    visibility.set("a", walls, "opacity");
    visibility.set("a", { kind: "element", expressId: 1 }, "hide");
    visibility.set("a", { kind: "unassigned" }, "hide");
    expect(visibility.exceptionCount("a", model)).toBeGreaterThan(0);
    visibility.set("a", model, "show");
    expect([...visibility.hiddenIds]).toEqual([]);
    expect(visibility.ghostExceptIds).toBeNull();
    expect(visibility.exceptionCount("a", model)).toBe(0);
    expect(visibility.get("a", { kind: "element", expressId: 1 })).toBe("show");
  });

  it("applies a storey action to its classes and leaves without changing siblings", () => {
    const visibility = setup();
    visibility.set("a", walls, "opacity");
    visibility.set("a", { kind: "element", expressId: 1 }, "show");
    visibility.set("a", storey, "hide");
    expect([...visibility.hiddenIds].sort()).toEqual([1, 2, 3]);
    expect(visibility.get("a", walls)).toBe("hide");
    expect(visibility.exceptionCount("a", storey)).toBe(0);
    visibility.set("a", storey, "show");
    expect(visibility.hiddenIds.size).toBe(0);
    expect(visibility.ghostExceptIds).toBeNull();
  });

  it("derives parent states from actual descendants, including individually hidden siblings", () => {
    const visibility = setup();
    visibility.set("a", { kind: "element", expressId: 1 }, "hide");
    expect(visibility.exceptionCount("a", walls)).toBe(1);
    visibility.set("a", { kind: "element", expressId: 2 }, "hide");
    expect(visibility.get("a", walls)).toBe("hide");
    expect(visibility.exceptionCount("a", walls)).toBe(0);
    expect(visibility.exceptionCount("a", storey)).toBeGreaterThan(0);
    visibility.set("a", walls, "show");
    expect(visibility.hiddenIds.size).toBe(0);
  });

  it("cycles the entire model through transparency, hidden and visible with no leftover overrides", () => {
    const visibility = setup();
    visibility.set("a", { kind: "element", expressId: 1 }, "hide");
    visibility.set("a", model, "opacity");
    expect(visibility.hiddenIds.size).toBe(0);
    expect(visibility.ghostExceptIds?.size).toBe(0);
    expect(visibility.get("a", storey)).toBe("opacity");
    visibility.set("a", model, "hide");
    expect(visibility.hiddenIds.size).toBe(5);
    visibility.set("a", model, "show");
    expect(visibility.hiddenIds.size).toBe(0);
    expect(visibility.ghostExceptIds).toBeNull();
  });
});
