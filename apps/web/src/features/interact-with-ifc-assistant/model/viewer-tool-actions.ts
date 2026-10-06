import type {
  IfcBimCatalog,
  IfcBimQuery,
  IfcElementSummary,
  IfcViewerSnapshot,
  IfcVisualPlan,
} from "@mnemo/ifc-viewer-adapter";

import type { SceneStyleInput, ViewerFilterInput } from "./viewer-tool-schemas";

type ViewerAssistantTarget = {
  applyVisualPlan(plan: IfcVisualPlan): void;
  fitToView(): void;
  frameSelection(): void;
  findBimIds(query: IfcBimQuery): number[];
  getSnapshot(): IfcViewerSnapshot;
  queryBim(query: IfcBimQuery): IfcElementSummary[];
  resetVisuals(): void;
  selectEntity(expressId: number | null): void;
};

type ViewerTargetGetter = () => ViewerAssistantTarget | null;

const ifcClassAliases: Record<string, string> = {
  mur: "IfcWall",
  murs: "IfcWall",
  wall: "IfcWall",
  walls: "IfcWall",
  porte: "IfcDoor",
  portes: "IfcDoor",
  door: "IfcDoor",
  doors: "IfcDoor",
  fenetre: "IfcWindow",
  fenetres: "IfcWindow",
  window: "IfcWindow",
  windows: "IfcWindow",
  pilier: "IfcColumn",
  piliers: "IfcColumn",
  poteau: "IfcColumn",
  poteaux: "IfcColumn",
  colonne: "IfcColumn",
  colonnes: "IfcColumn",
  column: "IfcColumn",
  columns: "IfcColumn",
  dalle: "IfcSlab",
  dalles: "IfcSlab",
  plancher: "IfcSlab",
  planchers: "IfcSlab",
  slab: "IfcSlab",
  slabs: "IfcSlab",
  poutre: "IfcBeam",
  poutres: "IfcBeam",
  beam: "IfcBeam",
  beams: "IfcBeam",
};

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

function requireReadyViewer(getTarget: ViewerTargetGetter) {
  const target = getTarget();
  if (!target || target.getSnapshot().phase !== "ready") {
    throw new Error("La maquette IFC n’est pas encore prête.");
  }
  return target;
}

function resolveIfcClass(catalog: IfcBimCatalog, requested: string) {
  const normalized = normalizeLabel(requested);
  const aliased = ifcClassAliases[normalized] ?? requested;
  const exact = catalog.types.find(
    ({ ifcClass }) => normalizeLabel(ifcClass) === normalizeLabel(aliased),
  );
  if (!exact) {
    throw new Error(`Classe IFC introuvable : ${requested}.`);
  }
  return exact.ifcClass;
}

function resolveStoreyId(catalog: IfcBimCatalog, input: ViewerFilterInput) {
  if (input.storeyExpressId !== undefined) {
    const storey = catalog.storeys.find(
      ({ expressId }) => expressId === input.storeyExpressId,
    );
    if (!storey) {
      throw new Error(
        `Niveau #${input.storeyExpressId} introuvable dans la maquette.`,
      );
    }
    return storey.expressId;
  }
  if (!input.storeyName) return undefined;

  const requested = normalizeLabel(input.storeyName);
  const exact = catalog.storeys.find(
    ({ name }) => normalizeLabel(name) === requested,
  );
  if (exact) return exact.expressId;

  const partial = catalog.storeys.filter(({ name }) => {
    const normalized = normalizeLabel(name);
    return normalized.includes(requested) || requested.includes(normalized);
  });
  if (partial.length === 1) return partial[0]?.expressId;
  if (partial.length > 1) {
    throw new Error(
      `Le niveau « ${input.storeyName} » est ambigu : ${partial.map(({ name }) => name).join(", ")}.`,
    );
  }
  throw new Error(`Niveau introuvable : ${input.storeyName}.`);
}

function resolveQuery(catalog: IfcBimCatalog, input: ViewerFilterInput) {
  return {
    ...(input.ifcClass
      ? { ifcClass: resolveIfcClass(catalog, input.ifcClass) }
      : {}),
    ...(input.storeyName || input.storeyExpressId
      ? { storeyId: resolveStoreyId(catalog, input) }
      : {}),
  } satisfies IfcBimQuery;
}

function parseHexColor(color: string): [number, number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
    1,
  ];
}

function uniqueIds(groups: Iterable<number>[]) {
  return [...new Set(groups.flatMap((group) => [...group]))];
}

export function createViewerToolActions(getTarget: ViewerTargetGetter) {
  return {
    inspectScene() {
      const target = requireReadyViewer(getTarget);
      const snapshot = target.getSnapshot();
      return {
        phase: snapshot.phase,
        entityCount: snapshot.entityCount,
        meshCount: snapshot.meshCount,
        classes: snapshot.catalog?.types ?? [],
        storeys: snapshot.catalog?.storeys ?? [],
        selection: snapshot.selection
          ? {
              expressId: snapshot.selection.expressId,
              globalId: snapshot.selection.globalId,
              ifcClass: snapshot.selection.ifcClass,
              name: snapshot.selection.name,
            }
          : null,
        visual: snapshot.visual,
      };
    },

    queryElements(input: { filter: ViewerFilterInput; limit: number }) {
      const target = requireReadyViewer(getTarget);
      const catalog = target.getSnapshot().catalog;
      if (!catalog) throw new Error("Le catalogue BIM n’est pas disponible.");
      const matches = target.queryBim(resolveQuery(catalog, input.filter));
      return {
        total: matches.length,
        returned: Math.min(matches.length, input.limit),
        truncated: matches.length > input.limit,
        elements: matches.slice(0, input.limit),
      };
    },

    setSceneStyle(input: SceneStyleInput) {
      const target = requireReadyViewer(getTarget);
      const catalog = target.getSnapshot().catalog;
      if (!catalog) throw new Error("Le catalogue BIM n’est pas disponible.");

      const groups = input.groups.map((group) => {
        const query = resolveQuery(catalog, group.filter);
        return {
          ids: target.findBimIds(query),
          color: group.color,
        };
      });
      const matchedIds = uniqueIds(groups.map(({ ids }) => ids));
      if (matchedIds.length === 0) {
        throw new Error("Aucun élément ne correspond aux groupes demandés.");
      }
      if (!input.focus && groups.every(({ color }) => color === undefined)) {
        throw new Error(
          "Une mise en forme doit colorer des éléments ou activer le focus.",
        );
      }

      target.applyVisualPlan({
        ...(input.focus ? { focusIds: matchedIds } : {}),
        colors: groups
          .filter(
            (group): group is { ids: number[]; color: string } =>
              group.color !== undefined,
          )
          .map(({ ids, color }) => ({ ids, color: parseHexColor(color) })),
        label: input.label ?? "Style appliqué par l’assistant",
      });

      return {
        matched: matchedIds.length,
        focus: input.focus,
        groups: groups.map(({ ids, color }, index) => ({
          index,
          matched: ids.length,
          color: color ?? null,
        })),
        contextControlledByInterface: true,
      };
    },

    hideElements(input: { filters: ViewerFilterInput[]; label?: string }) {
      const target = requireReadyViewer(getTarget);
      const catalog = target.getSnapshot().catalog;
      if (!catalog) throw new Error("Le catalogue BIM n’est pas disponible.");
      const hiddenIds = uniqueIds(
        input.filters.map((filter) =>
          target.findBimIds(resolveQuery(catalog, filter)),
        ),
      );
      if (hiddenIds.length === 0) {
        throw new Error("Aucun élément à masquer ne correspond aux critères.");
      }
      target.applyVisualPlan({
        hiddenIds,
        label: input.label ?? "Masquage par l’assistant",
      });
      return { hidden: hiddenIds.length };
    },

    selectElement(input: { expressId: number; frame: boolean }) {
      const target = requireReadyViewer(getTarget);
      target.selectEntity(input.expressId);
      const selection = target.getSnapshot().selection;
      if (!selection || selection.expressId !== input.expressId) {
        throw new Error(`Express ID #${input.expressId} introuvable.`);
      }
      if (input.frame) target.frameSelection();
      return {
        selected: {
          expressId: selection.expressId,
          globalId: selection.globalId,
          ifcClass: selection.ifcClass,
          name: selection.name,
        },
        framed: input.frame,
      };
    },

    frameView(input: { target: "all" | "selection" }) {
      const target = requireReadyViewer(getTarget);
      if (input.target === "selection") {
        if (!target.getSnapshot().selection) {
          throw new Error("Aucun élément IFC n’est sélectionné.");
        }
        target.frameSelection();
      } else {
        target.fitToView();
      }
      return { framed: input.target };
    },

    resetScene() {
      const target = requireReadyViewer(getTarget);
      target.resetVisuals();
      target.selectEntity(null);
      target.fitToView();
      return { reset: true };
    },
  };
}

export type ViewerToolActions = ReturnType<typeof createViewerToolActions>;
