import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  bimFilterSettingsSchema,
  removeBimFilterAsset,
  type BimFilterSettings,
} from "./bim-filters";
function settings(): BimFilterSettings {
  return {
    showContext: true,
    contextOpacity: 0.18,
    groups: [
      {
        id: randomUUID(),
        name: "Structure",
        assetIds: [randomUUID()],
        enabled: false,
        rules: [
          {
            id: randomUUID(),
            enabled: true,
            action: "color",
            color: "#123abc",
            query: { ifcClasses: ["IfcWall"], storeys: [] },
          },
        ],
      },
    ],
  };
}
describe("BIM filter contracts", () => {
  it("accepts named parents and independently enabled children", () =>
    expect(bimFilterSettingsSchema.parse(settings())).toEqual(
      expect.objectContaining({ showContext: true }),
    ));
  it("rejects duplicate ids across all groups and children", () => {
    const input = settings();
    input.groups.push({ ...input.groups[0], id: randomUUID() });
    expect(bimFilterSettingsSchema.safeParse(input).success).toBe(false);
  });
  it("validates names, colors, context and non-empty criteria", () => {
    const input = settings(),
      group = input.groups[0],
      rule = group.rules[0];
    for (const invalid of [
      { ...input, contextOpacity: 2 },
      { ...input, groups: [{ ...group, name: " " }] },
      {
        ...input,
        groups: [{ ...group, rules: [{ ...rule, color: "url(evil)" }] }],
      },
      {
        ...input,
        groups: [
          {
            ...group,
            rules: [{ ...rule, query: { ifcClasses: [], storeys: [] } }],
          },
        ],
      },
    ])
      expect(bimFilterSettingsSchema.safeParse(invalid).success).toBe(false);
  });
});

it("rejects levels from models outside a group and duplicate targets", () => {
  const input = settings();
  const group = input.groups[0];
  group.rules[0].query.storeys = [{ assetId: randomUUID(), storeyId: 42 }];
  expect(bimFilterSettingsSchema.safeParse(input).success).toBe(false);
  group.rules[0].query.storeys = [];
  group.assetIds.push(group.assetIds[0]);
  expect(bimFilterSettingsSchema.safeParse(input).success).toBe(false);
});

it("retains definitions and disables emptied groups and level-only rules", () => {
  const input = settings();
  const group = input.groups[0];
  group.enabled = true;
  group.rules[0].query = {
    ifcClasses: [],
    storeys: [{ assetId: group.assetIds[0], storeyId: 42 }],
  };
  const output = removeBimFilterAsset(input, group.assetIds[0]);
  expect(output.groups[0]).toMatchObject({
    id: group.id,
    enabled: false,
    assetIds: [],
  });
  expect(output.groups[0].rules[0]).toMatchObject({
    id: group.rules[0].id,
    enabled: false,
    query: { ifcClasses: [], storeys: [] },
  });
  expect(bimFilterSettingsSchema.parse(output)).toEqual(output);
  expect(input.groups[0].assetIds).toHaveLength(1);
});
