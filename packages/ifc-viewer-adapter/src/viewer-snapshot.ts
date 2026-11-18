import { DEFAULT_ISOLATION_CONTEXT_OPACITY } from "@mnemo/contracts/bim-filters";
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
    selectionIsolationActive: false,
    visualRevision: 0,
    visual: {
      mode: "all",
      label: null,
      matchCount: 0,
      showContext: true,
      contextOpacity: DEFAULT_ISOLATION_CONTEXT_OPACITY,
    },
    section: createEmptySectionSnapshot(),
    pointClouds: [],
    pointCloudOptions: { pointSize: 2 },
  };
}
