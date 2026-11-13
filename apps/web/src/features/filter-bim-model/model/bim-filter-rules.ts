import type { IfcVisualPlan } from "@mnemo/ifc-viewer-adapter";
import type {
  BimFilterSettings,
  BimFilterRule,
} from "@mnemo/contracts/bim-filters";
import type { BimFilterViewer } from "./viewer-target";
import {
  queryForBimFilterModel,
  type BimFilterModel,
} from "./bim-filter-model";

export type { BimFilterRule } from "@mnemo/contracts/bim-filters";
export type BimFilterDraft = Omit<BimFilterRule, "id" | "enabled">;
export const bimFilterActionLabels = {
  isolate: "Isoler",
  hide: "Masquer",
  color: "Coloriser",
} as const;

export function buildBimFilterPlan(
  settings: BimFilterSettings,
  models: readonly BimFilterModel[],
  viewer: Pick<BimFilterViewer, "findBimIds">,
  base: IfcVisualPlan,
): IfcVisualPlan {
  const hiddenIds = new Set(base.hiddenIds ?? []);
  const colors = Array.from(base.colors ?? []);
  const isolated = new Map<string, Set<number>>();
  let ruleCount = 0;
  for (const group of settings.groups) {
    if (!group.enabled || !group.assetIds.length) continue;
    for (const rule of group.rules) {
      if (!rule.enabled) continue;
      ruleCount += 1;
      const ids: number[] = [];
      for (const model of models) {
        if (!model.catalog || !group.assetIds.includes(model.assetId)) continue;
        const query = queryForBimFilterModel(rule.query, model.assetId);
        const matches = query ? viewer.findBimIds(query, model.assetId) : [];
        for (const id of matches) ids.push(id);
        if (rule.action === "isolate") {
          let focused = isolated.get(model.assetId);
          if (!focused) {
            focused = new Set();
            isolated.set(model.assetId, focused);
          }
          for (const id of matches) focused.add(id);
        }
      }
      if (rule.action === "hide") for (const id of ids) hiddenIds.add(id);
      if (rule.action === "color") {
        const [r, g, b] = [1, 3, 5].map(
          (offset) =>
            Number.parseInt(rule.color.slice(offset, offset + 2), 16) / 255,
        );
        colors.push({ ids, color: [r, g, b, 1] });
      }
    }
  }
  let focusIds = base.focusIds ? new Set(base.focusIds) : null;
  if (isolated.size) {
    const baseline = focusIds;
    focusIds = new Set<number>();
    for (const model of models) {
      if (!model.catalog) continue;
      const ids =
        isolated.get(model.assetId) ?? viewer.findBimIds({}, model.assetId);
      for (const id of ids) if (!baseline || baseline.has(id)) focusIds.add(id);
    }
  }
  return {
    ...base,
    focusIds,
    hiddenIds,
    colors,
    showContext: settings.showContext,
    contextOpacity: settings.contextOpacity,
    label: ruleCount
      ? `${ruleCount} filtre${ruleCount > 1 ? "s" : ""} actif${ruleCount > 1 ? "s" : ""}`
      : base.label,
  };
}
