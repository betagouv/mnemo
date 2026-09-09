import type { IfcDataStore } from "@ifc-lite/parser";
import { IfcQuery } from "@ifc-lite/query";

export type IfcBimQuery = {
  ifcClass?: string | null;
  storeyId?: number | null;
};

export type IfcBimType = {
  ifcClass: string;
  elementCount: number;
};

export type IfcBimStorey = {
  expressId: number;
  name: string;
  elevation: number | null;
  elementCount: number;
};

export type IfcBimCatalog = {
  types: IfcBimType[];
  storeys: IfcBimStorey[];
};

export type IfcElementSummary = {
  expressId: number;
  globalId: string;
  ifcClass: string;
  name: string;
  storeyId: number | null;
};

export type IfcBimIndex = {
  catalog: IfcBimCatalog;
  findIds(query: IfcBimQuery): number[];
  query(query: IfcBimQuery): IfcElementSummary[];
};

function intersection(left: Iterable<number>, right: ReadonlySet<number>) {
  return [...left].filter((expressId) => right.has(expressId));
}

export function createIfcBimIndex(
  store: IfcDataStore,
  renderableIds: Iterable<number>,
): IfcBimIndex {
  const queryApi = new IfcQuery(store);
  const renderable = new Set(renderableIds);
  const typeCounts = new Map<string, number>();

  for (const expressId of renderable) {
    const ifcClass = store.entities.getTypeName(expressId) || "IfcEntity";
    typeCounts.set(ifcClass, (typeCounts.get(ifcClass) ?? 0) + 1);
  }

  const findIds = (query: IfcBimQuery) => {
    let ids: number[];

    if (query.ifcClass) {
      ids = queryApi
        .ofType(query.ifcClass)
        .execute()
        .map((entity) => entity.expressId);
    } else if (query.storeyId !== null && query.storeyId !== undefined) {
      ids = queryApi
        .onStorey(query.storeyId)
        .execute()
        .map((entity) => entity.expressId);
    } else {
      ids = [...renderable];
    }

    let result = intersection(ids, renderable);

    if (
      query.ifcClass &&
      query.storeyId !== null &&
      query.storeyId !== undefined
    ) {
      const storeyIds = new Set(
        queryApi
          .onStorey(query.storeyId)
          .execute()
          .map((entity) => entity.expressId),
      );
      result = intersection(result, storeyIds);
    }

    return result;
  };

  return {
    catalog: {
      types: [...typeCounts.entries()]
        .map(([ifcClass, elementCount]) => ({ ifcClass, elementCount }))
        .sort((left, right) => left.ifcClass.localeCompare(right.ifcClass)),
      storeys: queryApi.storeys
        .map((storey) => ({
          expressId: storey.expressId,
          name: storey.name || `Niveau #${storey.expressId}`,
          elevation:
            store.spatialHierarchy?.storeyElevations.get(storey.expressId) ??
            null,
          elementCount: findIds({ storeyId: storey.expressId }).length,
        }))
        .sort((left, right) => {
          if (left.elevation !== null && right.elevation !== null) {
            return left.elevation - right.elevation;
          }
          return left.name.localeCompare(right.name);
        }),
    },
    findIds,
    query(query) {
      return findIds(query).map((expressId) => ({
        expressId,
        globalId: store.entities.getGlobalId(expressId),
        ifcClass: store.entities.getTypeName(expressId) || "IfcEntity",
        name: store.entities.getName(expressId),
        storeyId:
          store.spatialHierarchy?.elementToStorey.get(expressId) ?? null,
      }));
    },
  };
}
