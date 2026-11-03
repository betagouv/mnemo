import { describe, it, expect } from "vitest";
import { indexBcfComponents } from "./bcf-components";
const objects = [
  { assetId: "a", expressId: 42, globalId: "same-guid" },
  { assetId: "b", expressId: 42, globalId: "same-guid" },
  { assetId: "b", expressId: 84, globalId: "unique-guid" },
];
const index = indexBcfComponents(
  objects,
  (asset, id) => id + (asset === "a" ? 0 : 1000),
);
describe("federated BCF references", () => {
  it("retains a precise local reference across models sharing IFC GUIDs", () => {
    expect(index.resolve(index.encode([42, 1042])).ids).toEqual([42, 1042]);
  });
  it("reports ambiguous imported GUIDs rather than selecting both copies", () => {
    expect(index.resolve([{ ifcGuid: "same-guid" }])).toEqual({
      ids: [],
      unresolved: ["same-guid"],
    });
  });
  it("resolves uniquely identified objects after a model has been replaced", () => {
    expect(
      index.resolve([
        {
          ifcGuid: "unique-guid",
          originatingSystem: "Mnemo",
          authoringToolId: "old:123",
        },
      ]).ids,
    ).toEqual([1084]);
  });
});
