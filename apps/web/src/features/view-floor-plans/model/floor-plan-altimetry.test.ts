import { describe, expect, it } from "vitest";
import {
  floorPlanCutHeightLabel,
  floorPlanElevationLabels,
} from "./floor-plan-altimetry";

describe("floor plan altimetry", () => {
  it("labels the shared one-metre cut", () => {
    expect(floorPlanCutHeightLabel).toBe("+1 m");
  });

  it.each([
    [0, "±0,00"],
    [-0.0001, "±0,00"],
    [3.2, "+3,20"],
    [-2.75, "-2,75"],
    [1.234, "+1,234"],
  ])("formats IFC altitude %s in metres", (value, label) => {
    expect(floorPlanElevationLabels(value)).toEqual([
      `Altitude relative IFC ${label} m`,
    ]);
  });

  it.each([null, NaN, Infinity])("identifies missing altitude %s", (value) => {
    expect(floorPlanElevationLabels(value)).toEqual([
      "Altitude IFC non renseignée",
    ]);
  });

  it("identifies the file's datum separately from relative altitude", () => {
    expect(floorPlanElevationLabels(3.2, "NGF-IGN69")).toEqual([
      "Altitude relative IFC +3,20 m",
      "Référentiel du fichier NGF-IGN69",
    ]);
  });
});
