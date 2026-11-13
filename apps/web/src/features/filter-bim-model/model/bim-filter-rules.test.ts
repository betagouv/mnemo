import { describe, expect, it, vi } from "vitest";
import type { IfcVisualPlan } from "@mnemo/ifc-viewer-adapter";
import { buildBimFilterPlan, type BimFilterRule } from "./bim-filter-rules";

const walls = { ifcClasses: ["IfcWall"], storeyIds: [] };
const doors = { ifcClasses: ["IfcDoor"], storeyIds: [] };
function source() {
  return {
    findBimIds: vi.fn((query: { ifcClasses?: readonly string[] }) =>
      query.ifcClasses?.includes("IfcWall") ? [1, 2] : [3],
    ),
  };
}
const rules = [
  {
    id: "walls",
    enabled: true,
    query: walls,
    action: "isolate",
    color: "#000000",
  },
  {
    id: "doors",
    enabled: true,
    query: doors,
    action: "isolate",
    color: "#000000",
  },
  { id: "hide", enabled: true, query: doors, action: "hide", color: "#000000" },
  { id: "red", enabled: true, query: walls, action: "color", color: "#ff0000" },
] satisfies BimFilterRule[];

describe("BIM filter rule composition", () => {
  it("unions isolation rules and composes hiding and colors atomically", () => {
    const base: IfcVisualPlan = {
      focusIds: [9],
      hiddenIds: [8],
      colors: [{ ids: [7], color: [0, 0, 1, 1] }],
    };
    const plan = buildBimFilterPlan(rules, source(), base);
    expect(Array.from(plan.focusIds ?? [])).toEqual([9, 1, 2, 3]);
    expect(Array.from(plan.hiddenIds ?? [])).toEqual([8, 3]);
    expect(Array.from(plan.colors ?? [])).toEqual([
      { ids: [7], color: [0, 0, 1, 1] },
      { ids: [1, 2], color: [1, 0, 0, 1] },
    ]);
    expect(base).toEqual({
      focusIds: [9],
      hiddenIds: [8],
      colors: [{ ids: [7], color: [0, 0, 1, 1] }],
    });
  });

  it("rebuilds the result when a rule is disabled, removed or edited", () => {
    const viewer = source();
    const changed = rules
      .filter((rule) => rule.id !== "hide")
      .map((rule) =>
        rule.id === "doors"
          ? { ...rule, enabled: false }
          : rule.id === "red"
            ? { ...rule, color: "#00ff00" }
            : rule,
      );
    const plan = buildBimFilterPlan(changed, viewer, {});
    expect(Array.from(plan.focusIds ?? [])).toEqual([1, 2]);
    expect(Array.from(plan.hiddenIds ?? [])).toEqual([]);
    expect(Array.from(plan.colors ?? [])).toEqual([
      { ids: [1, 2], color: [0, 1, 0, 1] },
    ]);
    expect(viewer.findBimIds).not.toHaveBeenCalledWith(doors);
  });

  it("uses rule order for overlapping colors", () => {
    const plan = buildBimFilterPlan(
      [rules[3], { ...rules[3], id: "green", color: "#00ff00" }],
      source(),
      {},
    );
    expect(Array.from(plan.colors ?? []).map((group) => group.color)).toEqual([
      [1, 0, 0, 1],
      [0, 1, 0, 1],
    ]);
    expect(plan.focusIds).toBeNull();
  });

  it("restores the base when all rules are inactive", () => {
    const viewer = source();
    const plan = buildBimFilterPlan(
      rules.map((rule) => ({ ...rule, enabled: false })),
      viewer,
      { label: "Vue BCF", hiddenIds: [7] },
    );
    expect(plan.label).toBe("Vue BCF");
    expect(Array.from(plan.hiddenIds ?? [])).toEqual([7]);
    expect(viewer.findBimIds).not.toHaveBeenCalled();
  });
});
