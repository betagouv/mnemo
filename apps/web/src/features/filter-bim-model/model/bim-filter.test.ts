import { expect, it } from "vitest";
import { bimFilterLabel } from "./bim-filter";
it("qualifies levels by model even when their ids and labels overlap", () => {
  const models = ["a", "b"].map((assetId) => ({
    assetId,
    fileName: `${assetId}.ifc`,
    catalog: {
      types: [],
      unassignedCount: 0,
      storeys: [{ expressId: 42, name: "RDC", elementCount: 1, elevation: 0 }],
    },
  }));
  expect(
    bimFilterLabel(models, {
      ifcClasses: ["IfcWall"],
      storeys: [{ assetId: "b", storeyId: 42 }],
    }),
  ).toBe("IfcWall · RDC · b.ifc");
  expect(bimFilterLabel(models, { ifcClasses: [], storeys: [] })).toBe(
    "À configurer",
  );
});
