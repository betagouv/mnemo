"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { IfcVisualPlan } from "@mnemo/ifc-viewer-adapter";
import type {
  BimFilterGroup,
  BimFilterSettings,
} from "@mnemo/contracts/bim-filters";
import type { BimFilterControls } from "./bim-filter-controls";
import type { BimFilterViewer } from "./viewer-target";
import { buildBimFilterPlan } from "./bim-filter-rules";
import {
  activeBimFilterRules,
  haveSameBimFilterEffects,
} from "./bim-filter-groups";

export function useBimFilterRules(
  getViewer: () => BimFilterViewer | null,
  assetId: string,
  initial: BimFilterSettings,
  onChange: (settings: BimFilterSettings) => void,
) {
  const [settings, setSettings] = useState(initial);
  const current = useRef(initial);
  const base = useRef<IfcVisualPlan | null>(null);
  const applying = useRef(false);
  function publish(next: BimFilterSettings) {
    current.current = next;
    setSettings(next);
    onChange(next);
  }
  const onExternalVisualChange = useEffectEvent(() => {
    publish({
      ...current.current,
      groups: current.current.groups.map((group) => ({
        ...group,
        enabled: false,
      })),
    });
  });
  useEffect(() => {
    const viewer = getViewer();
    if (!viewer) return;
    base.current ??= viewer.getVisualPlan();
    let lastRevision = viewer.getSnapshot().visualRevision;
    const unsubscribe = viewer.subscribe((snapshot) => {
      if (snapshot.activeModelId !== assetId) return;
      if (snapshot.visualRevision === lastRevision) return;
      lastRevision = snapshot.visualRevision;
      if (applying.current) return;
      // Scene resets and BCF viewpoints retain definitions and disable effects.
      base.current = viewer.getVisualPlan();
      onExternalVisualChange();
    });
    applying.current = true;
    viewer.applyVisualPlan(
      buildBimFilterPlan(activeBimFilterRules(current.current), viewer, {
        ...base.current,
        showContext: current.current.showContext,
        contextOpacity: current.current.contextOpacity,
      }),
    );
    applying.current = false;
    return () => {
      unsubscribe();
    };
  }, [getViewer, assetId]);

  function changeGroups(groups: BimFilterGroup[]) {
    const viewer = getViewer();
    if (!viewer) return;
    const next = { ...current.current, groups };
    if (!haveSameBimFilterEffects(current.current, next)) {
      applying.current = true;
      try {
        viewer.applyVisualPlan(
          buildBimFilterPlan(activeBimFilterRules(next), viewer, {
            ...base.current,
            showContext: next.showContext,
            contextOpacity: next.contextOpacity,
          }),
        );
      } finally {
        applying.current = false;
      }
    }
    publish(next);
  }

  function changeContext(
    context: Pick<BimFilterSettings, "showContext" | "contextOpacity">,
  ) {
    const viewer = getViewer();
    if (!viewer) return;
    applying.current = true;
    try {
      viewer.setIsolationContext(context.showContext, context.contextOpacity);
    } finally {
      applying.current = false;
    }
    publish({
      ...current.current,
      showContext: context.showContext,
      contextOpacity: context.contextOpacity,
    });
  }

  const resetVisuals: BimFilterControls["resetVisuals"] = () => {
    const viewer = getViewer();
    if (!viewer) return null;
    const previousSettings = current.current;
    const previousBase = base.current;
    const previousPlan = viewer.getVisualPlan();
    viewer.resetVisuals();
    const expectedVisual = viewer.getSnapshot().visual;
    const expectedSettings = current.current;
    const canUndo = () =>
      getViewer() === viewer &&
      viewer.getSnapshot().activeModelId === assetId &&
      viewer.getSnapshot().visual === expectedVisual &&
      current.current === expectedSettings;
    return {
      canUndo,
      undo() {
        if (!canUndo()) return;
        applying.current = true;
        try {
          base.current = previousBase;
          viewer.applyVisualPlan(previousPlan);
        } finally {
          applying.current = false;
        }
        publish(previousSettings);
      },
    };
  };
  return { settings, changeGroups, changeContext, resetVisuals };
}
