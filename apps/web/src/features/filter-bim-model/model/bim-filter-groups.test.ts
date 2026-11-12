import { describe, expect, it } from "vitest";
import {
  activeBimFilterRules,
  countActiveBimFilterGroups,
  createBimFilterSettings,
  duplicateBimFilterGroup,
  haveSameBimFilterEffects,
} from "./bim-filter-groups";
const catalog = {
  types: [],
  unassignedCount: 0,
  storeys: [{ expressId: 42, name: "RDC", elementCount: 2, elevation: 0 }],
};
describe("BIM filter groups", () => {
  it("ignores names, identities and edits to inactive groups when comparing visual effects", () => {
    const settings = createBimFilterSettings(catalog);
    const next = {
      ...settings,
      groups: settings.groups.map((group) => ({
        ...group,
        id: crypto.randomUUID(),
        name: "Renommé",
        rules: group.rules.map((rule) => ({ ...rule, color: "#ff0000" })),
      })),
    };
    expect(haveSameBimFilterEffects(settings, next)).toBe(true);
    next.groups[1].enabled = true;
    expect(haveSameBimFilterEffects(settings, next)).toBe(false);
    expect(
      haveSameBimFilterEffects(next, {
        ...next,
        groups: next.groups.map((group) => ({ ...group, name: "Autre nom" })),
      }),
    ).toBe(true);
    expect(
      haveSameBimFilterEffects(next, {
        ...next,
        groups: next.groups.map((group) => ({
          ...group,
          rules: group.rules.map((rule) => ({ ...rule, color: "#00ff00" })),
        })),
      }),
    ).toBe(false);
  });
  it("counts active parents once and excludes empty or disabled groups", () => {
    const settings = createBimFilterSettings(catalog);
    expect(countActiveBimFilterGroups(settings)).toBe(0);
    const preset = settings.groups[1];
    const enabled = {
      ...preset,
      enabled: true,
      rules: [preset.rules[0], { ...preset.rules[0], id: crypto.randomUUID() }],
    };
    expect(countActiveBimFilterGroups({ ...settings, groups: [enabled] })).toBe(
      1,
    );
    expect(
      countActiveBimFilterGroups({
        ...settings,
        groups: [enabled, duplicateBimFilterGroup(enabled)],
      }),
    ).toBe(2);
    expect(
      countActiveBimFilterGroups({
        ...settings,
        groups: [
          { ...enabled, enabled: false },
          {
            ...enabled,
            id: crypto.randomUUID(),
            rules: enabled.rules.map((rule) => ({ ...rule, enabled: false })),
          },
        ],
      }),
    ).toBe(0);
  });
  it("provides sixteen distinct floor colors before reusing the palette", () => {
    const settings = createBimFilterSettings({
      ...catalog,
      storeys: Array.from({ length: 17 }, (_, index) => ({
        ...catalog.storeys[0],
        expressId: index + 1,
        name: `R+${index}`,
      })),
    });
    const colors = settings.groups[1].rules.map((rule) => rule.color);
    expect(new Set(colors.slice(0, 16)).size).toBe(16);
    expect(colors[16]).toBe(colors[0]);
  });
  it("provides an editable, inactive storey-color preset", () => {
    const settings = createBimFilterSettings(catalog);
    const preset = settings.groups[1];
    expect(preset.enabled).toBe(false);
    expect(preset.rules[0]).toMatchObject({
      action: "color",
      enabled: true,
      query: { storeyIds: [42] },
    });
    expect(activeBimFilterRules(settings)).toEqual([]);
    const enabled = { ...settings, groups: [{ ...preset, enabled: true }] };
    expect(activeBimFilterRules(enabled)).toHaveLength(1);
    expect(
      activeBimFilterRules({
        ...enabled,
        groups: [
          {
            ...preset,
            enabled: true,
            rules: [{ ...preset.rules[0], enabled: false }],
          },
        ],
      }),
    ).toEqual([]);
    expect(preset.rules[0].enabled).toBe(true);
  });
  it("duplicates a whole group with fresh ids and the same settings", () => {
    const original = createBimFilterSettings(catalog).groups[1];
    const copy = duplicateBimFilterGroup(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe("Couleurs par niveau (copie)");
    expect(copy.rules[0].id).not.toBe(original.rules[0].id);
    expect(copy.rules[0].query).toEqual(original.rules[0].query);
    expect(copy.rules[0].enabled).toBe(original.rules[0].enabled);
  });
});
