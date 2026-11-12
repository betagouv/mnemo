import type { GeoreferenceInfo } from "@ifc-lite/parser";
import type { Georeferencing } from "@ifc-lite/server-client";

export type IfcGeoreferencingStatus = {
  kind: "projected" | "site-only" | "local";
  crs: string | null;
  verticalDatum?: string;
};

/** A site latitude/longitude is not a projected placement for federation. */
export function classifyIfcGeoreferencing(
  georeference: GeoreferenceInfo | null,
): IfcGeoreferencingStatus {
  if (georeference?.source === "siteLocation")
    return { kind: "site-only", crs: null };
  if (georeference?.mapConversion && georeference.projectedCRS) {
    const crs = georeference.projectedCRS;
    const verticalDatum = crs.verticalDatum?.trim();
    return {
      kind: "projected",
      crs: crs.name,
      ...(verticalDatum ? { verticalDatum } : {}),
    };
  }
  return { kind: "local", crs: null };
}

export function classifyServerIfcGeoreferencing(
  geo: Georeferencing | undefined,
): IfcGeoreferencingStatus {
  if (geo?.source === "siteLocation") return { kind: "site-only", crs: null };
  if (!geo?.crs_name) return { kind: "local", crs: null };
  const verticalDatum = geo.vertical_datum?.trim();
  return {
    kind: "projected",
    crs: geo.crs_name,
    ...(verticalDatum ? { verticalDatum } : {}),
  };
}
