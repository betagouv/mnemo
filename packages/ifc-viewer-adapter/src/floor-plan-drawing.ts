import type {
  FloorPlanRule,
  FloorPlanStyleSettings,
} from "@mnemo/contracts/floor-plans";
import { extractPropertiesOnDemand, type IfcDataStore } from "@ifc-lite/parser";
import {
  createOverrideEngine,
  ARCHITECTURAL_PRESET,
  STRUCTURAL_PRESET,
  MEP_PRESET,
  HatchGenerator,
  type Drawing2D,
  type DrawingPolygon,
  type ElementData,
  type ResolvedGraphicStyle,
} from "@ifc-lite/drawing-2d";

export type FloorPlanDrawing = Drawing2D & {
  getElementExpressId: (id: number) => number;
  getElementProperties: (id: number) => NonNullable<ElementData["properties"]>;
};
export type FloorPlanStyle = ResolvedGraphicStyle;
export type FloorPlanPresetId = FloorPlanStyleSettings["preset"];
export const floorPlanPresets = [
  { id: "default", label: "Plan simple" },
  { id: "architectural", label: "Plan architectural" },
  { id: "structural", label: "Plan de structure (plancher bas)" },
  { id: "mep", label: "Réseaux techniques" },
] as const;
const presets = {
  default: null,
  architectural: ARCHITECTURAL_PRESET,
  structural: STRUCTURAL_PRESET,
  mep: MEP_PRESET,
};

export function createFloorPlanPropertyLookup(
  store: IfcDataStore,
  localId: (id: number) => number,
) {
  const cache = new Map<number, NonNullable<ElementData["properties"]>>();
  return (id: number) => {
    const cached = cache.get(id);
    if (cached) return cached;
    const result = Object.create(null) as NonNullable<
      ElementData["properties"]
    >;
    for (const set of extractPropertiesOnDemand(store, localId(id))) {
      const values = (result[set.name] ??= Object.create(null) as Record<
        string,
        unknown
      >);
      for (const property of set.properties) {
        if (Object.hasOwn(values, property.name)) continue;
        values[property.name] = property.value;
      }
    }
    cache.set(id, result);
    return result;
  };
}

export function createFloorPlanStyleResolver(
  drawing: Pick<FloorPlanDrawing, "getElementProperties">,
  presetId: FloorPlanPresetId,
  rules: readonly FloorPlanRule[] = [],
) {
  const engine = createFloorPlanOverrideEngine(presetId, rules);
  const cache = new Map<string, FloorPlanStyle>();
  return (entity: { entityId: number; ifcType: string }, lineWeight = 0.4) => {
    const key = `${entity.entityId}/${entity.ifcType}/${lineWeight}`;
    let style = cache.get(key);
    if (!style) {
      const needsProperties = presetId === "structural";
      style = engine.applyOverrides(
        {
          expressId: entity.entityId,
          ifcType: entity.ifcType,
          properties: needsProperties
            ? drawing.getElementProperties(entity.entityId)
            : undefined,
        },
        {
          fillColor: "#e5e5e5",
          strokeColor: "#161616",
          hatchPattern: "none",
          lineWeight,
        },
      ).style;
      cache.set(key, style);
    }
    return style;
  };
}

export function floorPlanHatches(
  polygon: DrawingPolygon,
  style: FloorPlanStyle,
) {
  if (style.hatchPattern === "none" || style.hatchPattern === "solid")
    return [];
  return new HatchGenerator().generateHatch(polygon, 100, {
    type: style.hatchPattern,
    spacing: style.hatchSpacing,
    angle: style.hatchAngle,
    secondaryAngle: style.hatchSecondaryAngle,
  }).lines;
}

export function createFloorPlanOverrideEngine(
  presetId: FloorPlanPresetId,
  rules: readonly FloorPlanRule[],
) {
  return createOverrideEngine([
    ...(presets[presetId]?.rules ?? []),
    ...rules.map((rule, index) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      priority: 1000 + index,
      criteria: {
        type: "ifcType" as const,
        ifcTypes: [rule.ifcType],
        includeSubtypes: true,
      },
      style: {
        fillColor: rule.fillColor,
        strokeColor: rule.strokeColor,
        lineWeight: rule.lineWeight,
      },
    })),
  ]);
}
