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
  unassignedCount: number;
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
  classesForStorey(storeyId: number | null): IfcBimType[];
  queryPage(
    storeyId: number | null,
    offset: number,
    limit: number,
    ifcClass?: string,
  ): IfcElementSummary[];
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
  const classesByStorey = new Map<number | null, Map<string, number>>();
  const pageCache = new Map<
    string,
    { offset: number; limit: number; result: IfcElementSummary[] }
  >();

  for (const expressId of renderable) {
    const ifcClass = store.entities.getTypeName(expressId) || "IfcEntity";
    typeCounts.set(ifcClass, (typeCounts.get(ifcClass) ?? 0) + 1);
    const storeyId =
      store.spatialHierarchy?.elementToStorey.get(expressId) ?? null;
    let classes = classesByStorey.get(storeyId);
    if (!classes) {
      classes = new Map();
      classesByStorey.set(storeyId, classes);
    }
    classes.set(ifcClass, (classes.get(ifcClass) ?? 0) + 1);
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

  const summarize = (expressId: number): IfcElementSummary => ({
    expressId,
    globalId: store.entities.getGlobalId(expressId),
    ifcClass: store.entities.getTypeName(expressId) || "IfcEntity",
    name: store.entities.getName(expressId),
    storeyId: store.spatialHierarchy?.elementToStorey.get(expressId) ?? null,
  });

  return {
    catalog: {
      unassignedCount: [...renderable].filter(
        (expressId) => !store.spatialHierarchy?.elementToStorey.has(expressId),
      ).length,
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
    classesForStorey(storeyId) {
      return [...(classesByStorey.get(storeyId) ?? new Map()).entries()]
        .map(([ifcClass, elementCount]) => ({ ifcClass, elementCount }))
        .sort((left, right) => left.ifcClass.localeCompare(right.ifcClass));
    },
    query(query) {
      return findIds(query).map(summarize);
    },
    queryPage(storeyId, offset, limit, ifcClass) {
      if (limit <= 0) return [];
      const cacheKey = `${storeyId ?? "none"}:${ifcClass ?? "all"}`;
      const cached = pageCache.get(cacheKey);
      if (cached?.offset === offset && cached.limit === limit) {
        return cached.result;
      }
      const page: IfcElementSummary[] = [];
      let skipped = 0;
      for (const expressId of renderable) {
        const elementStorey =
          store.spatialHierarchy?.elementToStorey.get(expressId) ?? null;
        if (elementStorey !== storeyId) continue;
        if (
          ifcClass &&
          (store.entities.getTypeName(expressId) || "IfcEntity") !== ifcClass
        )
          continue;
        if (skipped++ < offset) continue;
        page.push(summarize(expressId));
        if (page.length === limit) break;
      }
      pageCache.set(cacheKey, { offset, limit, result: page });
      return page;
    },
  };
}
