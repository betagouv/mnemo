import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bimFilterSettingsSchema, type BimFilterSettings } from "./bim-filters";
function settings(): BimFilterSettings {
  return {
    showContext: true,
    contextOpacity: 0.18,
    groups: [
      {
        id: randomUUID(),
        name: "Structure",
        enabled: false,
        rules: [
          {
            id: randomUUID(),
            enabled: true,
            action: "color",
            color: "#123abc",
            query: { ifcClasses: ["IfcWall"], storeyIds: [] },
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
            rules: [{ ...rule, query: { ifcClasses: [], storeyIds: [] } }],
          },
        ],
      },
    ])
      expect(bimFilterSettingsSchema.safeParse(invalid).success).toBe(false);
  });
});
