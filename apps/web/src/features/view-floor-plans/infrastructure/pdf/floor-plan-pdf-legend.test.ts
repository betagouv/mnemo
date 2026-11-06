import { describe, expect, it } from "vitest";
import { createFloorPlanStyleResolver } from "@mnemo/ifc-viewer-adapter";
import { buildFloorPlanLegend } from "./floor-plan-pdf-legend";

it("omits default styles when no custom rule applies", () => {
  const resolve = createFloorPlanStyleResolver(
    { getElementProperties: () => ({}) },
    "default",
  );
  const wall = { ifcType: "IfcWall", entityId: 1 };
  const style = resolve(wall);
  const entries = buildFloorPlanLegend(
    [
      { kind: "polygon", source: wall, style },
      {
        kind: "line",
        source: { ...wall, category: "projection" },
        style: resolve(wall, 0.2),
      },
      { kind: "line", source: { ...wall, category: "cut" }, style },
    ],
    [],
  );
  expect(entries).toEqual([]);
  expect(style.lineWeight).toBe(0.4);
});
describe("custom legend labels", () => {
  it("uses the final active rule name, including IFC subtypes", () => {
    const rule = {
      id: "wall",
      name: "Murs rouges",
      enabled: true,
      ifcType: "IfcWall",
      fillColor: "#ff0000",
      strokeColor: "#000000",
      lineWeight: 0.7,
    };
    const resolve = createFloorPlanStyleResolver(
      { getElementProperties: () => ({}) },
      "default",
      [rule],
    );
    const elements = ["IfcWall", "IfcWallStandardCase", "IfcDoor"].map(
      (ifcType, index) => ({
        kind: "polygon" as const,
        source: { ifcType },
        style: resolve({ ifcType, entityId: index }),
      }),
    );
    const entries = buildFloorPlanLegend(elements, [
      rule,
      { ...rule, id: "disabled", name: "Hidden", enabled: false },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      label: "Murs rouges",
      detail: "IfcWall, IfcWallStandardCase\nCoupe 0,7 mm",
      filled: true,
    });
  });
});
