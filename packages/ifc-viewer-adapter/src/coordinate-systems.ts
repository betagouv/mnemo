import { isLonLatInEpsgAreaOfUse, loadEpsgIndex } from "@ifc-lite/data";
import {
  resolveCrs,
  wellKnownCrsCode,
  type CrsTransformer,
} from "@ifc-lite/geo";

const compact = (label: string) =>
  label
    .normalize("NFD")
    .toLowerCase()
    .replace(/zone|[^a-z0-9]/g, "");

/**
 * Find the EPSG code of a CRS label such as "RGF93 / CC49" or "Lambert93".
 * Labels that several projections share stay unresolved.
 */
async function findEpsgCode(name: string) {
  const label = compact(name);
  const matches = (await loadEpsgIndex()).filter(
    (entry) =>
      entry.kind === "Projected" &&
      entry.proj4 &&
      !entry.deprecated &&
      [entry.name, ...entry.aliases].some(
        (alias) =>
          compact(alias) === label ||
          compact(alias.slice(alias.lastIndexOf("/") + 1)) === label,
      ),
  );
  return new Set(matches.map((entry) => entry.proj4)).size === 1
    ? matches[0]!.code
    : undefined;
}

/**
 * Resolve the projected CRS that an authoring tool wrote in IfcProjectedCRS.Name.
 * IFC-Lite reads any "… / UTM zone" label as WGS 84, so resolve codes only.
 */
export async function resolveProjectedCrs(
  name: string,
): Promise<CrsTransformer | null> {
  const declared = /(?:^|epsg\W*)(\d{4,5})(?=\D|$)/i.exec(name.trim())?.[1];
  const epsg = declared ?? wellKnownCrsCode(name) ?? (await findEpsgCode(name));
  const crs = epsg ? await resolveCrs({ epsg }) : null;
  return crs?.kind === "projected" ? crs : null;
}

/** Projects at the edge of a zone often keep using it. */
const areaMarginDegrees = 5;

export async function isInAreaOfUse(
  crs: CrsTransformer,
  [easting, northing]: readonly [number, number, number],
) {
  const geographic = crs.toWgs84([easting, northing]);
  if (!geographic) return false;
  return (
    crs.epsg === null ||
    (await isLonLatInEpsgAreaOfUse(
      crs.epsg,
      geographic[0],
      geographic[1],
      areaMarginDegrees,
    )) !== false
  );
}
