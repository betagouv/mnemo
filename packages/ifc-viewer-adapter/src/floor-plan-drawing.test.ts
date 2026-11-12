import { describe, expect, it, vi } from "vitest";
import type { IfcDataStore } from "@ifc-lite/parser";
import {
  createFloorPlanPropertyLookup,
  createFloorPlanStyleResolver,
} from "./floor-plan-drawing";

const extract = vi.hoisted(() => vi.fn());
vi.mock("@ifc-lite/parser", () => ({ extractPropertiesOnDemand: extract }));

describe("floor plan presets", () => {
  it("uses vendor architectural and MEP rules without reading properties", () => {
    const getElementProperties = vi.fn(() => ({}));
    const architectural = createFloorPlanStyleResolver(
      { getElementProperties },
      "architectural",
    );
    expect(
      architectural({ entityId: 1, ifcType: "IfcWindow" }).strokeColor,
    ).toBe("#1976D2");
    const mep = createFloorPlanStyleResolver({ getElementProperties }, "mep");
    expect(mep({ entityId: 2, ifcType: "IfcDuctSegment" }).fillColor).toBe(
      "#E3F2FD",
    );
    expect(getElementProperties).not.toHaveBeenCalled();
  });
  it("applies structural styles from IFC properties and caches resolutions", () => {
    const getElementProperties = vi.fn(() => ({
      Pset_WallCommon: { LoadBearing: true },
    }));
    const wall = { entityId: 1, ifcType: "IfcWall" };
    const structural = createFloorPlanStyleResolver(
      { getElementProperties },
      "structural",
    );
    expect(structural(wall).fillColor).toBe("#BBDEFB");
    structural(wall);
    expect(getElementProperties).toHaveBeenCalledTimes(1);
  });
  it("applies custom rules after presets, respects order and disabled rules", () => {
    const base = {
      id: "wall",
      name: "Wall",
      enabled: true,
      ifcType: "IfcWall",
      fillColor: "#123456",
      strokeColor: "#654321",
      lineWeight: 0.7,
    };
    const resolve = createFloorPlanStyleResolver(
      { getElementProperties: () => ({}) },
      "architectural",
      [
        base,
        { ...base, id: "last", fillColor: "#abcdef" },
        { ...base, id: "disabled", enabled: false },
      ],
    );
    expect(resolve({ entityId: 1, ifcType: "IfcWall" })).toMatchObject({
      fillColor: "#abcdef",
      strokeColor: "#654321",
      lineWeight: 0.7,
    });
    expect(resolve({ entityId: 2, ifcType: "IfcWindow" }).strokeColor).toBe(
      "#1976D2",
    );
  });
  it("merges duplicate sets and handles IFC names safely", () => {
    extract.mockReturnValue([
      {
        name: "Pset_WallCommon",
        properties: [{ name: "IsExternal", value: true }],
      },
      {
        name: "Pset_WallCommon",
        properties: [{ name: "LoadBearing", value: true }],
      },
      {
        name: "__proto__",
        properties: [{ name: "mnemoPolluted", value: true }],
      },
    ]);
    const getProperties = createFloorPlanPropertyLookup(
      {} as IfcDataStore,
      (id) => id - 1000,
    );
    expect(getProperties(1042).Pset_WallCommon).toEqual({
      IsExternal: true,
      LoadBearing: true,
    });
    expect(Object.hasOwn(Object.prototype, "mnemoPolluted")).toBe(false);
    getProperties(1042);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(extract.mock.calls[0][1]).toBe(42);
  });
});
