import type {
  GeoreferenceInfo,
  MapConversion,
  ProjectedCRS,
} from "@ifc-lite/parser";
import type { Georeferencing } from "@ifc-lite/server-client";
import {
  mapReferenceSchema,
  type MapReference,
} from "@mnemo/contracts/map-reference";

/** The part of IFC-Lite's georeference that the browser and Rust engines share. */
export type IfcGeoreference = Pick<GeoreferenceInfo, "source"> & {
  projectedCRS?: Omit<ProjectedCRS, "id">;
  mapConversion?: Omit<MapConversion, "id" | "sourceCRS" | "targetCRS">;
};

export type IfcGeoreferencingStatus = {
  kind: "projected" | "site-only" | "local";
  crs: string | null;
  verticalDatum?: string;
};

export function fromServerGeoreferencing(
  geo: Georeferencing | undefined,
): IfcGeoreference | null {
  if (!geo) return null;
  return {
    source: geo.source as IfcGeoreference["source"],
    projectedCRS: geo.crs_name
      ? {
          name: geo.crs_name,
          verticalDatum: geo.vertical_datum,
          mapUnitScale: geo.map_unit_scale,
        }
      : undefined,
    mapConversion: {
      eastings: geo.eastings,
      northings: geo.northings,
      orthogonalHeight: geo.orthogonal_height,
      xAxisAbscissa: geo.x_axis_abscissa,
      xAxisOrdinate: geo.x_axis_ordinate,
      scale: geo.scale,
      factorX: geo.factor_x,
      factorY: geo.factor_y,
      factorZ: geo.factor_z,
    },
  };
}

/** A site latitude/longitude is not a projected placement for federation. */
export function classifyIfcGeoreferencing(
  georeference: IfcGeoreference | null,
): IfcGeoreferencingStatus {
  if (georeference?.source === "siteLocation")
    return { kind: "site-only", crs: null };
  const crs = georeference?.projectedCRS;
  if (!georeference?.mapConversion || !crs?.name)
    return { kind: "local", crs: null };
  const verticalDatum = crs.verticalDatum?.trim();
  return {
    kind: "projected",
    crs: crs.name,
    ...(verticalDatum ? { verticalDatum } : {}),
  };
}

/** Larger than any projected coordinate in metres. */
const maximumProjectedMetres = 1e8;

/**
 * IFC expresses Scale between project and map units, while geometry is already in
 * metres. Exporters often leave the unit ratio out of Scale: both frames being
 * metric, the reading closest to 1 is the authored intent.
 */
function metricScale(scale: number, factor: number, unitRatio: number) {
  const authored = scale * factor;
  const converted = authored * unitRatio;
  return Math.abs(Math.log(converted)) < Math.abs(Math.log(authored))
    ? converted
    : authored;
}

/** Read the declared map conversion in metres, or null when it is unusable. */
export function readMapReference(
  georeference: IfcGeoreference | null,
  lengthUnitScale = 1,
): MapReference | null {
  const { mapConversion: conversion, projectedCRS: crs } = georeference ?? {};
  if (!conversion || !crs || georeference?.source === "siteLocation")
    return null;
  // IFC falls back to the project unit, but survey offsets are metres in practice.
  const mapUnit =
    crs.mapUnitScale ??
    (Math.max(Math.abs(conversion.eastings), Math.abs(conversion.northings)) >
    maximumProjectedMetres
      ? lengthUnitScale
      : 1);
  const scale = conversion.scale || 1;
  const unitRatio = mapUnit / lengthUnitScale;
  const parsed = mapReferenceSchema.safeParse({
    crs: crs.name,
    verticalDatum: crs.verticalDatum?.trim() || null,
    eastings: conversion.eastings * mapUnit,
    northings: conversion.northings * mapUnit,
    orthogonalHeight: conversion.orthogonalHeight * mapUnit,
    xAxisAbscissa: conversion.xAxisAbscissa ?? 1,
    xAxisOrdinate: conversion.xAxisOrdinate ?? 0,
    scaleX: metricScale(scale, conversion.factorX || 1, unitRatio),
    scaleY: metricScale(scale, conversion.factorY || 1, unitRatio),
    scaleZ: metricScale(scale, conversion.factorZ || 1, unitRatio),
  });
  return parsed.success ? parsed.data : null;
}
