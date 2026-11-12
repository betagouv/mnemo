import type { IfcBimQuery, IfcVisualPlan } from "@mnemo/ifc-viewer-adapter";
import type { BimFilterViewer } from "./viewer-target";

export type BimFilterAction = "isolate" | "hide" | "color";
export type BimFilterDraft = {
  query: IfcBimQuery;
  action: BimFilterAction;
  color: string;
};
export type BimFilterRule = { id: string; enabled: boolean } & (
  BimFilterDraft | { action: "storey-colors" }
);
export const bimFilterActionLabels = {
  isolate: "Isoler",
  hide: "Masquer",
  color: "Coloriser",
  "storey-colors": "Coloriser par niveau",
} as const;

export function buildBimFilterPlan(
  rules: readonly BimFilterRule[],
  viewer: Pick<BimFilterViewer, "findBimIds" | "getStoreyColorGroups">,
  base: IfcVisualPlan,
): IfcVisualPlan {
  const enabled = rules.filter((rule) => rule.enabled);
  const hiddenIds = new Set(base.hiddenIds ?? []);
  let focusIds = base.focusIds ? new Set(base.focusIds) : null;
  const colors = Array.from(base.colors ?? []);
  for (const rule of enabled) {
    if (rule.action === "storey-colors") {
      colors.push(...viewer.getStoreyColorGroups());
      continue;
    }
    const ids = viewer.findBimIds(rule.query);
    switch (rule.action) {
      case "isolate":
        focusIds ??= new Set();
        for (const id of ids) focusIds.add(id);
        break;
      case "hide":
        for (const id of ids) hiddenIds.add(id);
        break;
      case "color": {
        const channels = [1, 3, 5].map(
          (offset) =>
            Number.parseInt(rule.color.slice(offset, offset + 2), 16) / 255,
        );
        colors.push({ ids, color: [channels[0], channels[1], channels[2], 1] });
        break;
      }
    }
  }
  return {
    ...base,
    focusIds,
    hiddenIds,
    colors,
    label: enabled.length
      ? `${enabled.length} filtre${enabled.length > 1 ? "s" : ""} actif${enabled.length > 1 ? "s" : ""}`
      : base.label,
  };
}
