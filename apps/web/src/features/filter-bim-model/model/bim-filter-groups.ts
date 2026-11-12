import type { IfcBimCatalog } from "@mnemo/ifc-viewer-adapter";
import type {
  BimFilterGroup,
  BimFilterSettings,
} from "@mnemo/contracts/bim-filters";

export function activeBimFilterRules(settings: BimFilterSettings) {
  return settings.groups
    .filter((group) => group.enabled)
    .flatMap((group) => group.rules.filter((rule) => rule.enabled));
}

export function haveSameBimFilterEffects(
  previous: BimFilterSettings,
  next: BimFilterSettings,
) {
  const effects = (settings: BimFilterSettings) =>
    activeBimFilterRules(settings).map(({ action, query, color }) => ({
      action,
      query,
      color: action === "color" ? color : null,
    }));
  return JSON.stringify(effects(previous)) === JSON.stringify(effects(next));
}
export function countActiveBimFilterGroups(settings: BimFilterSettings) {
  return settings.groups.filter(
    (group) => group.enabled && group.rules.some((rule) => rule.enabled),
  ).length;
}
export function duplicateBimFilterGroup(group: BimFilterGroup): BimFilterGroup {
  return {
    ...group,
    id: crypto.randomUUID(),
    name: `${group.name.slice(0, 72)} (copie)`,
    rules: group.rules.map((rule) => ({ ...rule, id: crypto.randomUUID() })),
  };
}
export function createBimFilterSettings(
  catalog: IfcBimCatalog,
): BimFilterSettings {
  const palette = [
    "#6a6af4",
    "#009081",
    "#e4794a",
    "#a558a0",
    "#c8aa39",
    "#518fff",
    "#ce0500",
    "#98ab68",
    "#ffbdbd",
    "#865c28",
    "#00ac8c",
    "#d8a0ff",
    "#ffca00",
    "#2a6692",
    "#f66e19",
    "#6c4238",
  ];
  return {
    showContext: true,
    contextOpacity: 0.18,
    groups: [
      {
        id: crypto.randomUUID(),
        name: "Mes filtres",
        enabled: true,
        rules: [],
      },
      ...(catalog.storeys.length
        ? [
            {
              id: crypto.randomUUID(),
              name: "Couleurs par niveau",
              enabled: false,
              rules: catalog.storeys.map((storey, index) => ({
                id: crypto.randomUUID(),
                enabled: true,
                action: "color" as const,
                query: { ifcClasses: [], storeyIds: [storey.expressId] },
                color: palette[index % palette.length],
              })),
            },
          ]
        : []),
    ],
  };
}
