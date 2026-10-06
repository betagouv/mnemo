import type { GeoreferenceInfo } from "@ifc-lite/parser";

export type IfcGeoreferencingStatus = {
  kind: "projected" | "site-only" | "local";
  crs: string | null;
};

/** A site latitude/longitude is not a projected placement for federation. */
export function classifyIfcGeoreferencing(
  georeference: GeoreferenceInfo | null,
): IfcGeoreferencingStatus {
  if (georeference?.source === "siteLocation") {
    return { kind: "site-only", crs: null };
  }
  if (georeference?.mapConversion && georeference.projectedCRS) {
    return { kind: "projected", crs: georeference.projectedCRS.name };
  }
  return { kind: "local", crs: null };
}
