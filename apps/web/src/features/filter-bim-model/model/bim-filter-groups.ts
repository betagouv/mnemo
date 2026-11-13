import type { BimFilterModel } from "./bim-filter-model";
import type {
  BimFilterGroup,
  BimFilterSettings,
} from "@mnemo/contracts/bim-filters";

export function haveSameBimFilterEffects(
  previous: BimFilterSettings,
  next: BimFilterSettings,
) {
  const effects = (settings: BimFilterSettings) =>
    settings.groups
      .filter((group) => group.enabled && group.assetIds.length > 0)
      .flatMap((group) =>
        group.rules
          .filter((rule) => rule.enabled)
          .map(({ action, query, color }) => ({
            assetIds: [...group.assetIds].sort(),
            action,
            query,
            color: action === "color" ? color : null,
          })),
      );
  return JSON.stringify(effects(previous)) === JSON.stringify(effects(next));
}
export function countActiveBimFilterGroups(settings: BimFilterSettings) {
  return settings.groups.filter(
    (group) =>
      group.enabled &&
      group.assetIds.length > 0 &&
      group.rules.some((rule) => rule.enabled),
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
  models: readonly BimFilterModel[],
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
  const storeys = models.flatMap((model) =>
    (model.catalog?.storeys ?? []).map((storey) => ({
      assetId: model.assetId,
      storeyId: storey.expressId,
    })),
  );
  return {
    showContext: true,
    contextOpacity: 0.18,
    groups: [
      {
        id: crypto.randomUUID(),
        name: "Mes filtres",
        assetIds: models.map((model) => model.assetId),
        enabled: true,
        rules: [],
      },
      ...(storeys.length
        ? [
            {
              id: crypto.randomUUID(),
              name: "Couleurs par niveau",
              assetIds: models.map((model) => model.assetId),
              enabled: false,
              rules: storeys.map((storey, index) => ({
                id: crypto.randomUUID(),
                enabled: true,
                action: "color" as const,
                query: { ifcClasses: [], storeys: [storey] },
                color: palette[index % palette.length],
              })),
            },
          ]
        : []),
    ],
  };
}
