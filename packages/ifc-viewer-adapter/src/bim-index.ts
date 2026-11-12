import type { IfcDataStore } from "@ifc-lite/parser";
import { IfcQuery } from "@ifc-lite/query";

export type IfcBimQuery = {
  ifcClasses?: readonly string[];
  storeyIds?: readonly number[];
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
  getElement(expressId: number): IfcElementSummary | null;
  findIds(query: IfcBimQuery): number[];
  count(query: IfcBimQuery): number;
  query(query: IfcBimQuery): IfcElementSummary[];
  classesForStorey(storeyId: number | null): IfcBimType[];
  queryPage(
    storeyId: number | null,
    offset: number,
    limit: number,
    ifcClass?: string,
  ): IfcElementSummary[];
};

export function createIfcBimIndex(
  store: IfcDataStore,
  renderableIds: Iterable<number>,
): IfcBimIndex {
  const queryApi = new IfcQuery(store);
  const renderable = new Set(renderableIds);
  const typeCounts = new Map<string, number>();
  const untypedIds: number[] = [];
  const classesByStorey = new Map<number | null, Map<string, number>>();
  const pageCache = new Map<
    string,
    { offset: number; limit: number; result: IfcElementSummary[] }
  >();

  for (const expressId of renderable) {
    const ifcClass = store.entities.getTypeName(expressId) || "IfcEntity";
    typeCounts.set(ifcClass, (typeCounts.get(ifcClass) ?? 0) + 1);
    if (ifcClass === "IfcEntity") untypedIds.push(expressId);
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
    const byStorey = query.storeyIds?.length
      ? new Set(
          query.storeyIds.flatMap((id) =>
            queryApi
              .onStorey(id)
              .execute()
              .map((entity) => entity.expressId),
          ),
        )
      : null;
    const candidates = query.ifcClasses?.length
      ? [
          ...queryApi
            .ofType(
              ...query.ifcClasses.map((name) =>
                name === "IfcEntity" ? "Unknown" : name,
              ),
            )
            .execute()
            .map((entity) => entity.expressId),
          ...(query.ifcClasses.includes("IfcEntity") ? untypedIds : []),
        ]
      : (byStorey ?? renderable);
    return [...new Set(candidates)].filter(
      (id) => renderable.has(id) && (!byStorey || byStorey.has(id)),
    );
  };

  const summarize = (expressId: number): IfcElementSummary => ({
    expressId,
    globalId: store.entities.getGlobalId(expressId),
    ifcClass: store.entities.getTypeName(expressId) || "IfcEntity",
    name: store.entities.getName(expressId),
    storeyId: store.spatialHierarchy?.elementToStorey.get(expressId) ?? null,
  });

  return {
    getElement: (expressId) =>
      renderable.has(expressId) ? summarize(expressId) : null,
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
          elementCount: findIds({ storeyIds: [storey.expressId] }).length,
        }))
        .sort((left, right) => {
          if (left.elevation !== null && right.elevation !== null) {
            return left.elevation - right.elevation;
          }
          return left.name.localeCompare(right.name);
        }),
    },
    findIds,
    count(query) {
      const classes = query.ifcClasses?.length
        ? new Set(query.ifcClasses)
        : null;
      const levels = query.storeyIds?.length ? new Set(query.storeyIds) : null;
      let count = 0;
      for (const [storeyId, types] of classesByStorey) {
        if (levels && (storeyId === null || !levels.has(storeyId))) continue;
        for (const [ifcClass, amount] of types) {
          if (!classes || classes.has(ifcClass)) count += amount;
        }
      }
      return count;
    },
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
