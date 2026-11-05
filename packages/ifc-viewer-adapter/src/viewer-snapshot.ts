import type { IfcViewerSnapshot } from "./viewer-types";
import { createEmptySectionSnapshot } from "./section-controller";

export function createEmptyViewerSnapshot(): IfcViewerSnapshot {
  return {
    phase: "idle",
    parserPercent: null,
    meshCount: 0,
    entityCount: null,
    message: null,
    selection: null,
    selectedElements: [],
    selectionPhase: "idle",
    selectionMessage: null,
    catalog: null,
    processing: { engine: null, cacheKey: null, cacheHit: null },
    models: [],
    activeModelId: null,
    visual: {
      mode: "all",
      label: null,
      matchCount: 0,
      showContext: true,
      contextOpacity: 0.1,
    },
    section: createEmptySectionSnapshot(),
    pointClouds: [],
    pointCloudOptions: { pointSize: 2 },
  };
}
