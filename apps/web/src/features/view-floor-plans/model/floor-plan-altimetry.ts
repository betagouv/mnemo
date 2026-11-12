import { floorPlanCutHeight } from "@mnemo/contracts/floor-plans";

export const floorPlanCutHeightLabel = `+${floorPlanCutHeight.toLocaleString("fr-FR")} m`;
const metres = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
  signDisplay: "exceptZero",
});
function altitude(value: number) {
  return `${Math.abs(value) < 0.0005 ? "±0,00" : metres.format(value)} m`;
}
/** Storey elevation is relative to the building. The file's datum is separate metadata. */
export function floorPlanElevationLabels(
  elevation: number | null,
  verticalDatum?: string,
): string[] {
  const labels = [
    elevation === null || !Number.isFinite(elevation)
      ? "Altitude IFC non renseignée"
      : `Altitude relative IFC ${altitude(elevation)}`,
  ];
  if (verticalDatum) labels.push(`Référentiel du fichier ${verticalDatum}`);
  return labels;
}
