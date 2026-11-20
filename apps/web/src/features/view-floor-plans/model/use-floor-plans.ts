"use client";

import type { FloorPlanViewer } from "./viewer-target";
import type {
  FloorPlanRule,
  SavedFloorPlan,
} from "@mnemo/contracts/floor-plans";
import { useSavedFloorPlans } from "./use-saved-floor-plans";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FloorPlanDrawing,
  FloorPlanPresetId,
} from "@mnemo/ifc-viewer-adapter";

export function useFloorPlans(
  getViewer: () => FloorPlanViewer | null,
  projectId: string,
  initialViews: SavedFloorPlan[],
) {
  const saved = useSavedFloorPlans(projectId, initialViews);
  const [rules, setRules] = useState<FloorPlanRule[]>([]);
  const [plan, setPlan] = useState<{
    id: number;
    assetId: string;
    storeyId: number;
    title: string;
    drawing: FloorPlanDrawing;
  } | null>(null);
  const [preset, setPreset] = useState<FloorPlanPresetId>("default");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  useEffect(
    () => () => {
      requestId.current++;
      getViewer()?.cancelFloorPlan();
    },
    [getViewer],
  );

  async function open(
    assetId: string,
    storeyId: number,
    title: string,
    savedView?: SavedFloorPlan,
  ) {
    const request = ++requestId.current;
    setPending(true);
    setError(null);
    try {
      const viewer = getViewer();
      if (!viewer) throw new Error("La visionneuse n'est pas prête.");
      const drawing = await viewer.generateFloorPlan(assetId, storeyId);
      if (request === requestId.current) {
        setPlan({ id: request, assetId, storeyId, title, drawing });
        saved.select(savedView);
        if (savedView) {
          setPreset(savedView.style.preset);
          setRules(savedView.style.rules);
        } else {
          setPreset("default");
          setRules([]);
        }
      }
    } catch (error) {
      if (request === requestId.current) {
        setError(
          `Niveau « ${title} » — ${error instanceof Error ? error.message : "Impossible de générer ce plan."}`,
        );
      }
    } finally {
      if (request === requestId.current) setPending(false);
    }
  }
  function cancel() {
    requestId.current++;
    getViewer()?.cancelFloorPlan();
    setPending(false);
    setError(null);
  }
  const classes = useMemo(
    () =>
      plan
        ? Array.from(
            new Set(
              [...plan.drawing.cutPolygons, ...plan.drawing.lines].map(
                (item) => item.ifcType,
              ),
            ),
          )
            .filter((type) => /^Ifc[A-Za-z0-9]+$/.test(type))
            .sort()
        : [],
    [plan],
  );
  return {
    plan,
    pending,
    error,
    open,
    cancel,
    preset,
    setPreset,
    rules,
    setRules,
    classes,
    saved,
  };
}
