import type {
  IfcElementSummary,
  IfcViewerSnapshot,
  IfcVisualPlan,
} from "@mnemo/ifc-viewer-adapter";
import { describe, expect, it, vi } from "vitest";

import { createViewerToolActions } from "./viewer-tool-actions";

function createSnapshot(): IfcViewerSnapshot {
  return {
    phase: "ready",
    parserPercent: 100,
    meshCount: 4,
    entityCount: 4,
    message: null,
    selection: null,
    selectedElements: [],
    selectionPhase: "idle",
    selectionMessage: null,
    catalog: {
      unassignedCount: 0,
      types: [
        { ifcClass: "IfcColumn", elementCount: 1 },
        { ifcClass: "IfcWall", elementCount: 3 },
      ],
      storeys: [
        { expressId: 10, name: "Étage 1", elevation: 0, elementCount: 2 },
        { expressId: 20, name: "Étage 2", elevation: 3, elementCount: 2 },
      ],
    },
    processing: { engine: "rust", cacheKey: "cache", cacheHit: true },
    models: [],
    activeModelId: "model-a",
    visual: {
      mode: "all",
      label: null,
      matchCount: 0,
      showContext: true,
      contextOpacity: 0.1,
    },
    pointClouds: [],
    pointCloudOptions: { pointSize: 2 },
    section: {
      active: null,
      plane: {
        source: "axis",
        axis: "down",
        position: 50,
        flipped: false,
        normal: null,
        distance: null,
        pickedAt: null,
      },
      box: null,
      pickMode: null,
      draftPoint: null,
      trace: null,
      message: null,
    },
  };
}

const elements: IfcElementSummary[] = [
  {
    expressId: 101,
    globalId: "wall-one",
    ifcClass: "IfcWall",
    name: "Mur 1",
    storeyId: 10,
  },
  {
    expressId: 102,
    globalId: "column-one",
    ifcClass: "IfcColumn",
    name: "Pilier 1",
    storeyId: 10,
  },
  {
    expressId: 201,
    globalId: "wall-two",
    ifcClass: "IfcWall",
    name: "Mur 2",
    storeyId: 20,
  },
];

function createHarness() {
  let snapshot = createSnapshot();
  const plans: IfcVisualPlan[] = [];
  const target = {
    applyVisualPlan: vi.fn((plan: IfcVisualPlan) => plans.push(plan)),
    fitToView: vi.fn(),
    frameSelection: vi.fn(),
    getSnapshot: () => snapshot,
    queryBim: vi.fn(
      (query: { ifcClass?: string | null; storeyId?: number | null }) =>
        elements.filter(
          (element) =>
            (!query.ifcClass || element.ifcClass === query.ifcClass) &&
            (!query.storeyId || element.storeyId === query.storeyId),
        ),
    ),
    findBimIds: vi.fn(
      (query: { ifcClass?: string | null; storeyId?: number | null }) =>
        elements
          .filter(
            (element) =>
              (!query.ifcClass || element.ifcClass === query.ifcClass) &&
              (!query.storeyId || element.storeyId === query.storeyId),
          )
          .map((element) => element.expressId),
    ),
    resetVisuals: vi.fn(),
    selectEntity: vi.fn((expressId: number | null) => {
      snapshot = {
        ...snapshot,
        selection:
          expressId === 101
            ? {
                expressId: 101,
                globalId: "wall-one",
                ifcClass: "IfcWall",
                name: "Mur 1",
                description: "",
                objectType: "",
                tag: "",
                propertySets: [],
                quantitySets: [],
              }
            : null,
      };
    }),
  };
  return { actions: createViewerToolActions(() => target), plans, target };
}

describe("viewer assistant tools", () => {
  it("combines storeys and French IFC aliases in one atomic visual plan", () => {
    const { actions, plans } = createHarness();

    const result = actions.setSceneStyle({
      focus: true,
      label: "Niveaux et piliers",
      groups: [
        { filter: { storeyName: "etage 1" }, color: "#0000FF" },
        { filter: { storeyExpressId: 20 }, color: "#FF0000" },
        { filter: { ifcClass: "piliers" }, color: "#800080" },
      ],
    });

    expect(result).toMatchObject({ matched: 3, focus: true });
    expect(plans).toHaveLength(1);
    expect([...((plans[0]?.focusIds as number[]) ?? [])]).toEqual([
      101, 102, 201,
    ]);
    expect(plans[0]).not.toHaveProperty("contextOpacity");
    expect(plans[0]).not.toHaveProperty("showContext");
    expect(plans[0]?.colors).toHaveLength(3);
  });

  it("queries, selects and frames without recreating viewer state", () => {
    const { actions, target } = createHarness();

    expect(
      actions.queryElements({
        filter: { ifcClass: "IfcWall", storeyName: "Étage 2" },
        limit: 20,
      }),
    ).toMatchObject({
      total: 1,
      elements: [{ expressId: 201 }],
    });
    expect(
      actions.selectElement({ expressId: 101, frame: true }),
    ).toMatchObject({ selected: { globalId: "wall-one" }, framed: true });
    expect(target.frameSelection).toHaveBeenCalledOnce();
  });

  it("resets visuals, selection and camera only on an explicit reset", () => {
    const { actions, target } = createHarness();

    expect(actions.resetScene()).toEqual({ reset: true });
    expect(target.resetVisuals).toHaveBeenCalledOnce();
    expect(target.selectEntity).toHaveBeenCalledWith(null);
    expect(target.fitToView).toHaveBeenCalledOnce();
  });
});
