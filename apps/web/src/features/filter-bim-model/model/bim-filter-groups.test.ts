import { describe, expect, it } from "vitest";
import {
  countActiveBimFilterGroups,
  createBimFilterSettings,
  duplicateBimFilterGroup,
  haveSameBimFilterEffects,
} from "./bim-filter-groups";
const model = {
  assetId: "a",
  fileName: "a.ifc",
  catalog: {
    types: [],
    unassignedCount: 0,
    storeys: [{ expressId: 42, name: "RDC", elementCount: 2, elevation: 0 }],
  },
};
describe("project BIM filter groups", () => {
  it("provides a targeted, inactive color preset and sixteen distinct colors", () => {
    const settings = createBimFilterSettings([
      {
        ...model,
        catalog: {
          ...model.catalog,
          storeys: Array.from({ length: 17 }, (_, index) => ({
            ...model.catalog.storeys[0],
            expressId: index + 1,
          })),
        },
      },
    ]);
    const preset = settings.groups[1];
    expect(preset.assetIds).toEqual(["a"]);
    expect(preset.enabled).toBe(false);
    expect(preset.rules[0].query.storeys).toEqual([
      { assetId: "a", storeyId: 1 },
    ]);
    expect(
      new Set(preset.rules.slice(0, 16).map((rule) => rule.color)).size,
    ).toBe(16);
    expect(preset.rules[16].color).toBe(preset.rules[0].color);
  });
  it("counts each active parent once regardless of its number of targets", () => {
    const settings = createBimFilterSettings([
      model,
      { ...model, assetId: "b" },
    ]);
    expect(countActiveBimFilterGroups(settings)).toBe(0);
    settings.groups[1].enabled = true;
    expect(countActiveBimFilterGroups(settings)).toBe(1);
    settings.groups.push(duplicateBimFilterGroup(settings.groups[1]));
    expect(countActiveBimFilterGroups(settings)).toBe(2);
    for (const group of settings.groups)
      for (const rule of group.rules) rule.enabled = false;
    expect(countActiveBimFilterGroups(settings)).toBe(0);
  });
  it("distinguishes changes to targets from metadata-only changes", () => {
    const previous = createBimFilterSettings([model]);
    previous.groups[1].enabled = true;
    const next = structuredClone(previous);
    next.groups[1].name = "Renommé";
    expect(haveSameBimFilterEffects(previous, next)).toBe(true);
    next.groups[1].assetIds.push("b");
    expect(haveSameBimFilterEffects(previous, next)).toBe(false);
    next.groups[1].enabled = false;
    previous.groups[1].enabled = false;
    expect(haveSameBimFilterEffects(previous, next)).toBe(true);
  });
  it("duplicates targets and criteria with fresh group and child ids", () => {
    const original = createBimFilterSettings([model]).groups[1];
    const copy = duplicateBimFilterGroup(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.rules[0].id).not.toBe(original.rules[0].id);
    expect(copy.assetIds).toEqual(original.assetIds);
    expect(copy.rules[0].query).toEqual(original.rules[0].query);
  });
});
