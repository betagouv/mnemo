import {
  comparePropertyValues,
  IfcTypeEnumFromString,
  PropertyValueType,
  QuantityType,
  RelationshipGraphBuilder,
  type SpatialNode,
} from "@ifc-lite/data";
import {
  createSyntheticDataStore,
  REL_TYPE_MAP,
  type IfcDataStore,
} from "@ifc-lite/parser";
import type { DataModel, EntityMetadata } from "@ifc-lite/server-client";

const serverEntities = new WeakMap<
  IfcDataStore,
  ReadonlyMap<number, EntityMetadata>
>();

function quantityType(value: string): QuantityType {
  const normalized = value.replace(/^IfcQuantity/i, "").toLowerCase();
  switch (normalized) {
    case "area":
      return QuantityType.Area;
    case "volume":
      return QuantityType.Volume;
    case "count":
      return QuantityType.Count;
    case "weight":
      return QuantityType.Weight;
    case "time":
      return QuantityType.Time;
    case "number":
      return QuantityType.Number;
    default:
      return QuantityType.Length;
  }
}

export function getServerEntity(store: IfcDataStore, expressId: number) {
  return serverEntities.get(store)?.get(expressId);
}

/** Adapt IFC-Lite's decoded server model to the same store used by the BIM tree. */
export function createServerDataStore(
  data: DataModel,
  schema: string,
  fileSize: number,
  totalEntityCount = data.entities.columns.count,
): IfcDataStore {
  const version: IfcDataStore["schemaVersion"] =
    schema === "IFC2X3" || schema === "IFC4X3" || schema === "IFC5"
      ? schema
      : "IFC4";
  const columns = data.entities.columns;
  // Avoid duplicating millions of STEP primitives from the columnar server
  // model into a second JS Map. The viewer indexes only renderable and spatial
  // entities; detailed metadata remains available in the server model.
  const spatialIds = new Set(
    data.spatialHierarchy.nodes.map((node) => node.entity_id),
  );
  const entities: Array<{
    expressId: number;
    type: string;
    globalId: string;
    name: string;
    hasGeometry: boolean;
  }> = [];
  for (let index = 0; index < columns.count; index += 1) {
    const expressId = columns.expressId[index];
    const hasGeometry = Boolean(columns.hasGeometry[index]);
    if (!hasGeometry && !spatialIds.has(expressId)) continue;
    entities.push({
      expressId,
      type: columns.typeName[index] ?? "IfcEntity",
      globalId: columns.globalId[index] ?? "",
      name: columns.name[index] ?? "",
      hasGeometry,
    });
  }
  const store = createSyntheticDataStore({
    schemaVersion: version,
    fileSize,
    entityCount: totalEntityCount,
    entities,
  });
  serverEntities.set(
    store,
    new Map(
      entities.map(({ expressId }) => [
        expressId,
        data.entities.get(expressId)!,
      ]),
    ),
  );
  const psets = new Map<number, ReturnType<IfcDataStore["getProperties"]>>();
  const qsets = new Map<number, ReturnType<IfcDataStore["getQuantities"]>>();
  const relationships = new RelationshipGraphBuilder();
  for (const rel of data.relationships) {
    const relation =
      REL_TYPE_MAP[rel.rel_type.toUpperCase() as keyof typeof REL_TYPE_MAP];
    if (relation !== undefined)
      relationships.addEdge(
        rel.relating_id,
        rel.related_id,
        relation,
        rel.rel_id ?? 0,
      );
    if (rel.rel_type.toUpperCase() !== "IFCRELDEFINESBYPROPERTIES") continue;
    const pset = data.propertySets.get(rel.relating_id);
    if (pset) {
      const sets = psets.get(rel.related_id) ?? [];
      sets.push({
        name: pset.pset_name,
        globalId: "",
        properties: pset.properties.map((property) => {
          const raw = property.property_value;
          const type = property.property_type;
          const value =
            type === "boolean"
              ? raw === "true"
              : type === "integer" || type === "real" || type === "number"
                ? Number(raw)
                : raw;
          return {
            name: property.property_name,
            type:
              type === "boolean"
                ? PropertyValueType.Boolean
                : type === "integer"
                  ? PropertyValueType.Integer
                  : type === "real" || type === "number"
                    ? PropertyValueType.Real
                    : PropertyValueType.String,
            value,
            dataType: property.data_type,
            values: property.values,
          };
        }),
      });
      psets.set(rel.related_id, sets);
    }
    const qset = data.quantitySets.get(rel.relating_id);
    if (qset) {
      const sets = qsets.get(rel.related_id) ?? [];
      sets.push({
        name: qset.qset_name,
        globalId: "",
        quantities: qset.quantities.map((quantity) => ({
          name: quantity.quantity_name,
          type: quantityType(quantity.quantity_type),
          value: quantity.quantity_value,
        })),
      });
      qsets.set(rel.related_id, sets);
    }
  }
  store.properties.getForEntity = (id) => psets.get(id) ?? [];
  store.properties.getPropertyValue = (id, setName, name) =>
    psets
      .get(id)
      ?.find((set) => set.name === setName)
      ?.properties.find((property) => property.name === name)?.value ?? null;
  store.properties.findByProperty = (name, operator, value, setName) =>
    [...psets]
      .filter(([, sets]) =>
        sets.some(
          (set) =>
            (!setName || set.name === setName) &&
            set.properties.some(
              (property) =>
                property.name === name &&
                comparePropertyValues(property.value, operator, value),
            ),
        ),
      )
      .map(([id]) => id);
  store.quantities.getForEntity = (id) => qsets.get(id) ?? [];
  store.quantities.getQuantityValue = (id, setName, name) =>
    qsets
      .get(id)
      ?.find((set) => set.name === setName)
      ?.quantities.find((quantity) => quantity.name === name)?.value ?? null;
  store.relationships = relationships.build();

  const nodes = new Map(
    data.spatialHierarchy.nodes.map((node) => [node.entity_id, node]),
  );
  const visited = new Set<number>();
  const build = (id: number, depth = 0): SpatialNode => {
    const node = nodes.get(id);
    if (!node || depth > 100 || visited.has(id))
      throw new Error("Arborescence IFC invalide.");
    visited.add(id);
    const result: SpatialNode = {
      expressId: id,
      type: IfcTypeEnumFromString(node.type_name),
      name: node.name ?? node.type_name,
      elevation: node.elevation,
      elements: node.element_ids,
      children: node.children_ids.map((child) => build(child, depth + 1)),
    };
    visited.delete(id);
    return result;
  };
  const project = nodes.has(data.spatialHierarchy.project_id)
    ? build(data.spatialHierarchy.project_id)
    : {
        expressId: 0,
        type: IfcTypeEnumFromString("IfcProject"),
        name: "Projet",
        children: [],
        elements: [],
      };
  const byStorey = new Map<number, number[]>();
  const byBuilding = new Map<number, number[]>();
  const bySite = new Map<number, number[]>();
  const bySpace = new Map<number, number[]>();
  const storeyElevations = new Map<number, number>();
  for (const node of nodes.values()) {
    const type = node.type_name.toUpperCase();
    if (type === "IFCBUILDINGSTOREY") {
      byStorey.set(node.entity_id, node.element_ids);
      if (node.elevation !== undefined)
        storeyElevations.set(node.entity_id, node.elevation);
    } else if (type === "IFCBUILDING")
      byBuilding.set(node.entity_id, node.element_ids);
    else if (type === "IFCSITE") bySite.set(node.entity_id, node.element_ids);
    else if (type === "IFCSPACE") bySpace.set(node.entity_id, node.element_ids);
  }
  store.spatialHierarchy = {
    project,
    byStorey,
    byBuilding,
    bySite,
    bySpace,
    storeyElevations,
    storeyHeights: new Map(),
    elementToStorey: data.spatialHierarchy.element_to_storey,
    elementToContainer: data.spatialHierarchy.element_to_space,
    getStoreyElements: (id) => byStorey.get(id) ?? [],
    getStoreyByElevation: (z) =>
      [...storeyElevations].sort(
        (a, b) => Math.abs(a[1] - z) - Math.abs(b[1] - z),
      )[0]?.[0] ?? null,
    getContainingSpace: (id) =>
      data.spatialHierarchy.element_to_space.get(id) ?? null,
    getPath: (id) => {
      const path: SpatialNode[] = [];
      let current = nodes.get(
        data.spatialHierarchy.element_to_storey.get(id) ?? id,
      );
      while (current) {
        path.unshift({
          expressId: current.entity_id,
          type: IfcTypeEnumFromString(current.type_name),
          name: current.name ?? current.type_name,
          children: [],
          elements: current.element_ids,
        });
        current = nodes.get(current.parent_id);
      }
      return path;
    },
  };
  return store;
}
