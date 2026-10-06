import { GeometryProcessor } from "@ifc-lite/geometry";
import {
  extractEntityAttributesOnDemand,
  extractPropertiesOnDemand,
  extractQuantitiesOnDemand,
  IfcParser,
  type IfcDataStore,
} from "@ifc-lite/parser";
import { Renderer } from "@ifc-lite/renderer";
import {
  createPointCloudOctreeStream,
  createPointCloudStream,
} from "@mnemo/point-cloud-viewer-adapter";

import { createIfcBimIndex } from "./bim-index";
import { createIfcServerGeometryClient } from "./server-geometry";
import type { IfcElementDetails, IfcViewerRuntime } from "./viewer-types";

function readElementDetails(
  store: IfcDataStore,
  expressId: number,
): IfcElementDetails | null {
  if (!store.entityIndex.byId.has(expressId)) return null;

  const attributes = extractEntityAttributesOnDemand(store, expressId);

  return {
    expressId,
    globalId: attributes.globalId || store.entities.getGlobalId(expressId),
    ifcClass:
      store.entities.getTypeName(expressId) ||
      store.getEntity(expressId)?.type ||
      "IfcEntity",
    name: attributes.name || store.entities.getName(expressId),
    description: attributes.description,
    objectType: attributes.objectType,
    tag: attributes.tag,
    propertySets: extractPropertiesOnDemand(store, expressId).map((set) => ({
      name: set.name,
      globalId: set.globalId,
      values: set.properties.map((property) => ({
        name: property.name,
        type: property.type,
        value: property.value,
        values: property.values,
        dataType: property.dataType,
      })),
    })),
    quantitySets: extractQuantitiesOnDemand(store, expressId).map((set) => ({
      name: set.name,
      globalId: set.globalId,
      values: set.quantities.map((quantity) => ({
        name: quantity.name,
        type: quantity.type,
        value: quantity.value,
      })),
    })),
  };
}

export function createDefaultRuntime(): IfcViewerRuntime {
  return {
    createRenderer: (canvas) => new Renderer(canvas),
    createGeometryProcessor: () => new GeometryProcessor(),
    createParser: () => new IfcParser(),
    createServerClient: createIfcServerGeometryClient,
    readElementDetails,
    createBimIndex: createIfcBimIndex,
    createPointCloudStream,
    createPointCloudOctreeStream,
    fetch: globalThis.fetch.bind(globalThis),
    requestFrame: globalThis.requestAnimationFrame.bind(globalThis),
    cancelFrame: globalThis.cancelAnimationFrame.bind(globalThis),
    createResizeObserver: (callback) => new ResizeObserver(callback),
  };
}
