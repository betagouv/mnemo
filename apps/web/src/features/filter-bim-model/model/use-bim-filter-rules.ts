"use client";

import { useState } from "react";
import type {
  IfcVisualPlan,
  IfcVisualSnapshot,
} from "@mnemo/ifc-viewer-adapter";
import type { BimFilterViewer } from "./viewer-target";
import {
  buildBimFilterPlan,
  type BimFilterDraft,
  type BimFilterRule,
} from "./bim-filter-rules";

type FilterState = {
  rules: BimFilterRule[];
  base: IfcVisualPlan | null;
  visual: IfcVisualSnapshot;
};

export function useBimFilterRules(
  getViewer: () => BimFilterViewer | null,
  visual: IfcVisualSnapshot,
) {
  const [state, setState] = useState<FilterState>({
    rules: [],
    base: null,
    visual,
  });
  // A viewpoint, undo or external reset replaces the scene's visual plan.
  if (state.visual !== visual) setState({ rules: [], base: null, visual });

  function apply(rules: BimFilterRule[], base = state.base) {
    const viewer = getViewer();
    if (!viewer) return;
    const baseline = base ?? viewer.getVisualPlan();
    viewer.applyVisualPlan(buildBimFilterPlan(rules, viewer, baseline));
    setState({
      rules,
      base: rules.length ? baseline : null,
      visual: viewer.getSnapshot().visual,
    });
  }
  function save(draft: BimFilterDraft, id?: string) {
    if (id) {
      apply(
        state.rules.map((rule) =>
          rule.id === id ? { ...draft, id, enabled: rule.enabled } : rule,
        ),
      );
    } else {
      apply([
        ...state.rules,
        { ...draft, id: crypto.randomUUID(), enabled: true },
      ]);
    }
  }
  function reset() {
    const viewer = getViewer();
    if (!viewer) return;
    viewer.resetVisuals();
    setState({ rules: [], base: null, visual: viewer.getSnapshot().visual });
  }
  function setContext(show: boolean, opacity: number) {
    const viewer = getViewer();
    if (!viewer) return;
    const base = state.base ?? viewer.getVisualPlan();
    viewer.setIsolationContext(show, opacity);
    setState({
      ...state,
      base: { ...base, showContext: show, contextOpacity: opacity },
      visual: viewer.getSnapshot().visual,
    });
  }
  return {
    rules: state.rules,
    save,
    reset,
    setContext,
    addStoreyColors: () =>
      apply([
        ...state.rules,
        { id: crypto.randomUUID(), enabled: true, action: "storey-colors" },
      ]),
    remove: (id: string) => apply(state.rules.filter((rule) => rule.id !== id)),
    toggle: (id: string) =>
      apply(
        state.rules.map((rule) =>
          rule.id === id ? { ...rule, enabled: !rule.enabled } : rule,
        ),
      ),
  };
}
