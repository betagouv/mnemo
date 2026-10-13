import { ServerEntityIndex, type DataModel } from "@ifc-lite/server-client";
import { describe, expect, it } from "vitest";

import { createIfcBimIndex } from "./bim-index";
import { createServerDataStore, getServerEntity } from "./server-data-store";

describe("server IFC model bridge", () => {
  it("preserves BIM hierarchy, properties and entity identity without IFC source bytes", () => {
    const data: DataModel = {
      entities: ServerEntityIndex.fromRows([
        {
          entity_id: 1,
          type_name: "IfcProject",
          name: "Projet",
          has_geometry: false,
        },
        {
          entity_id: 2,
          type_name: "IfcBuildingStorey",
          name: "Rez-de-chaussée",
          has_geometry: false,
        },
        {
          entity_id: 42,
          type_name: "IfcWall",
          name: "Mur",
          description: "Façade",
          has_geometry: true,
        },
        { entity_id: 99, type_name: "IfcPropertySet", has_geometry: false },
      ]),
      propertySets: new Map([
        [
          99,
          {
            pset_id: 99,
            pset_name: "Pset_WallCommon",
            properties: [
              {
                property_name: "IsExternal",
                property_value: "true",
                property_type: "boolean",
              },
            ],
          },
        ],
      ]),
      quantitySets: new Map(),
      relationships: [
        {
          rel_type: "IfcRelDefinesByProperties",
          relating_id: 99,
          related_id: 42,
        },
      ],
      classifications: [],
      materials: [],
      documents: [],
      spatialHierarchy: {
        nodes: [
          {
            entity_id: 1,
            parent_id: 0,
            level: 0,
            path: "1",
            type_name: "IfcProject",
            name: "Projet",
            children_ids: [2],
            element_ids: [],
          },
          {
            entity_id: 2,
            parent_id: 1,
            level: 1,
            path: "1/2",
            type_name: "IfcBuildingStorey",
            name: "Rez-de-chaussée",
            elevation: 0,
            children_ids: [],
            element_ids: [42],
          },
        ],
        project_id: 1,
        element_to_storey: new Map([[42, 2]]),
        element_to_building: new Map(),
        element_to_site: new Map(),
        element_to_space: new Map(),
      },
    };
    const store = createServerDataStore(data, "IFC4", 0);
    expect(store.source.byteLength).toBe(0);
    expect(store.entityCount).toBe(4);
    expect(store.entityIndex.byId.has(99)).toBe(false);
    expect(store.getProperties(42)[0]?.properties[0]?.value).toBe(true);
    expect(store.properties.findByProperty("IsExternal", "=", true)).toEqual([
      42,
    ]);
    expect(getServerEntity(store, 42)?.description).toBe("Façade");
    expect(createIfcBimIndex(store, [42]).catalog.storeys[0]).toMatchObject({
      expressId: 2,
      elementCount: 1,
    });
  });
});
