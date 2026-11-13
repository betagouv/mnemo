import type { BimFilterQuery } from "@mnemo/contracts/bim-filters";
import type { BimFilterModel } from "./bim-filter-model";

export function bimFilterLabel(
  models: readonly BimFilterModel[],
  query: BimFilterQuery,
) {
  const levels = query.storeys.map((level) => {
    const model = models.find((item) => item.assetId === level.assetId);
    const name =
      model?.catalog?.storeys.find((item) => item.expressId === level.storeyId)
        ?.name ?? `Niveau #${level.storeyId}`;
    return `${name} · ${model?.fileName ?? level.assetId}`;
  });
  return (
    [query.ifcClasses.join(", "), levels.join(", ")]
      .filter(Boolean)
      .join(" · ") || "À configurer"
  );
}
