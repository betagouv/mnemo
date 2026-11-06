import type { FloorPlanRule } from "@mnemo/contracts/floor-plans";
import {
  createFloorPlanOverrideEngine,
  type FloorPlanStyle,
} from "@mnemo/ifc-viewer-adapter";

export type FloorPlanLegendEntry = {
  label: string;
  detail: string;
  style: FloorPlanStyle;
  filled: boolean;
};
type LegendSource = {
  source: { ifcType: string; category?: string };
  style: FloorPlanStyle;
  kind: "polygon" | "line";
};

/** Group identical appearances, retaining the actual cut/projection pen weights. */
export function buildFloorPlanLegend(
  elements: readonly LegendSource[],
  rules: readonly FloorPlanRule[],
): FloorPlanLegendEntry[] {
  const engine = createFloorPlanOverrideEngine("default", rules);
  const labels = new Map<string, string | null>();
  const groups = new Map<
    string,
    {
      label: string;
      style: FloorPlanStyle;
      filled: boolean;
      classes: Set<string>;
      cut: Set<number>;
      projection: Set<number>;
    }
  >();
  for (const { source, style, kind } of elements) {
    if (!style.visible) continue;
    let label = labels.get(source.ifcType);
    if (label === undefined) {
      label =
        engine
          .getMatchingRules({ expressId: 0, ifcType: source.ifcType })
          .at(-1)?.name ?? null;
      labels.set(source.ifcType, label);
    }
    if (label === null) continue;
    const key = JSON.stringify([label, { ...style, lineWeight: 0 }]);
    let group = groups.get(key);
    if (!group) {
      group = {
        label,
        style: { ...style },
        filled: false,
        classes: new Set(),
        cut: new Set(),
        projection: new Set(),
      };
      groups.set(key, group);
    }
    group.classes.add(source.ifcType);
    group.filled ||= kind === "polygon";
    group.style.lineWeight = Math.max(group.style.lineWeight, style.lineWeight);
    const cut = kind === "polygon" || source.category === "cut";
    (cut ? group.cut : group.projection).add(style.lineWeight);
  }
  return [...groups.values()].map((group) => {
    const details: string[] = [];
    if (!group.classes.has(group.label))
      details.push([...group.classes].join(", "));
    const weights = (values: Set<number>) =>
      [...values]
        .sort((a, b) => a - b)
        .map((value) => value.toLocaleString("fr-FR"))
        .join(" / ");
    const strokes: string[] = [];
    if (group.cut.size) strokes.push(`Coupe ${weights(group.cut)} mm`);
    if (group.projection.size)
      strokes.push(`Projection ${weights(group.projection)} mm`);
    details.push(strokes.join(" · "));
    return {
      label: group.label,
      detail: details.join("\n"),
      style: group.style,
      filled: group.filled,
    };
  });
}
