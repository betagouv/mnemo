import type { IfcBimCatalog, IfcBimQuery } from "@mnemo/ifc-viewer-adapter";

export function bimFilterLabel(catalog: IfcBimCatalog, query: IfcBimQuery) {
  const classes = query.ifcClasses ?? [];
  const levels = catalog.storeys.filter((level) =>
    query.storeyIds?.includes(level.expressId),
  );
  return (
    [classes.join(", "), levels.map((level) => level.name).join(", ")]
      .filter(Boolean)
      .join(" · ") || "Toute la maquette"
  );
}
