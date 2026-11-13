import type { IfcBimCatalog, IfcBimQuery } from "@mnemo/ifc-viewer-adapter";
import type { BimFilterQuery } from "@mnemo/contracts/bim-filters";

export type BimFilterModel = {
  assetId: string;
  fileName: string;
  catalog?: IfcBimCatalog;
};

export function queryForBimFilterModel(
  query: BimFilterQuery,
  assetId: string,
): IfcBimQuery | null {
  const storeyIds = query.storeys
    .filter((level) => level.assetId === assetId)
    .map((level) => level.storeyId);
  if (query.storeys.length && !storeyIds.length) return null;
  return { ifcClasses: query.ifcClasses, storeyIds };
}
