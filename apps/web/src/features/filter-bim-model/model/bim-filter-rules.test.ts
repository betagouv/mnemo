import { describe, expect, it, vi } from "vitest";
import type {
  BimFilterGroup,
  BimFilterSettings,
} from "@mnemo/contracts/bim-filters";
import type { IfcBimQuery } from "@mnemo/ifc-viewer-adapter";
import { buildBimFilterPlan } from "./bim-filter-rules";
import type { BimFilterModel } from "./bim-filter-model";

const models: BimFilterModel[] = ["a", "b"].map((assetId) => ({
  assetId,
  fileName: `${assetId}.ifc`,
  catalog: { types: [], storeys: [], unassignedCount: 0 },
}));
function group(assetIds = ["a"]): BimFilterGroup {
  return {
    id: "group",
    name: "Structure",
    enabled: true,
    assetIds,
    rules: [
      {
        id: "rule",
        enabled: true,
        action: "isolate",
        query: { ifcClasses: ["IfcWall"], storeys: [] },
        color: "#ff0000",
      },
    ],
  };
}
function settings(groups: BimFilterGroup[]): BimFilterSettings {
  return { groups, showContext: true, contextOpacity: 0.18 };
}
function source() {
  return {
    findBimIds: vi.fn((query: IfcBimQuery, assetId?: string | null) => {
      const offset = assetId === "b" ? 100 : 0;
      const ids = query.ifcClasses?.length
        ? query.ifcClasses.includes("IfcWall")
          ? [1]
          : [2]
        : [1, 2];
      return ids.map((id) => id + offset);
    }),
  };
}
describe("project BIM filter composition", () => {
  it("isolates only within the targeted model and keeps other models visible", () => {
    const plan = buildBimFilterPlan(settings([group()]), models, source(), {});
    expect([...plan.focusIds!]).toEqual([1, 101, 102]);
  });
  it("targets two models and cumulates child actions without local-id collisions", () => {
    const walls = group(["a", "b"]);
    const doors = {
      ...group(["b"]),
      id: "doors",
      rules: [
        {
          ...walls.rules[0],
          id: "hide",
          action: "hide" as const,
          query: { ifcClasses: ["IfcDoor"], storeys: [] },
        },
      ],
    };
    const colors = {
      ...group(["b"]),
      id: "color",
      rules: [{ ...walls.rules[0], id: "paint", action: "color" as const }],
    };
    const plan = buildBimFilterPlan(
      settings([walls, doors, colors]),
      models,
      source(),
      {},
    );
    expect([...plan.focusIds!]).toEqual([1, 101]);
    expect([...plan.hiddenIds!]).toEqual([102]);
    expect([...plan.colors!]).toEqual([{ ids: [101], color: [1, 0, 0, 1] }]);
    expect(plan.label).toBe("3 filtres actifs");
  });
  it("binds identical storey ids to their respective models", () => {
    const current = group(["a", "b"]);
    current.rules[0].query.storeys = [{ assetId: "a", storeyId: 10 }];
    const viewer = source();
    const plan = buildBimFilterPlan(settings([current]), models, viewer, {});
    expect([...plan.focusIds!]).toEqual([1]);
    expect(viewer.findBimIds).toHaveBeenCalledWith(
      { ifcClasses: ["IfcWall"], storeyIds: [10] },
      "a",
    );
    expect(viewer.findBimIds).not.toHaveBeenCalledWith(expect.anything(), "b");
    current.rules[0].query.storeys.push({ assetId: "b", storeyId: 10 });
    expect([
      ...buildBimFilterPlan(settings([current]), models, viewer, {}).focusIds!,
    ]).toEqual([1, 101]);
  });
  it("restores the baseline when groups or children are disabled", () => {
    const current = group();
    current.enabled = false;
    const viewer = source();
    const base = { label: "Vue BCF", hiddenIds: [8], focusIds: [1, 101] };
    const plan = buildBimFilterPlan(settings([current]), models, viewer, base);
    expect(plan.label).toBe(base.label);
    expect([...plan.hiddenIds!]).toEqual([8]);
    expect([...plan.focusIds!]).toEqual([1, 101]);
    expect(viewer.findBimIds).not.toHaveBeenCalled();
    current.enabled = true;
    current.rules[0].enabled = false;
    expect(
      buildBimFilterPlan(settings([current]), models, viewer, {}).focusIds,
    ).toBeNull();
  });
  it("keeps the baseline isolation as a constraint and respects color ordering", () => {
    const current = group(["a", "b"]);
    current.rules.push(
      { ...current.rules[0], id: "color", action: "color" },
      { ...current.rules[0], id: "last", action: "color", color: "#00ff00" },
    );
    const plan = buildBimFilterPlan(settings([current]), models, source(), {
      focusIds: [1],
    });
    expect([...plan.focusIds!]).toEqual([1]);
    expect([...plan.colors!].map((entry) => entry.color)).toEqual([
      [1, 0, 0, 1],
      [0, 1, 0, 1],
    ]);
  });
  it("handles large result sets without spreading them onto the call stack", () => {
    const current = group();
    current.rules[0].action = "hide";
    const ids = Array.from({ length: 150000 }, (_, index) => index);
    const plan = buildBimFilterPlan(
      settings([current]),
      models,
      { findBimIds: () => ids },
      {},
    );
    expect([...plan.hiddenIds!]).toHaveLength(ids.length);
  });
});
