import type {
  IfcPositioningIssue,
  IfcViewerSnapshot,
} from "@mnemo/ifc-viewer-adapter";

type Model = Pick<
  IfcViewerSnapshot["models"][number],
  "fileName" | "georeferencing" | "positioningIssues" | "skippedElements"
>;

function describeIssue(issue: IfcPositioningIssue, crs: string) {
  switch (issue) {
    case "no-georeference":
      return "Aucun géoréférencement : la maquette conserve ses coordonnées locales.";
    case "site-only":
      return "Seules la latitude et la longitude du site sont renseignées, sans projection : la maquette conserve ses coordonnées locales.";
    case "invalid-conversion":
      return "La conversion cartographique déclarée est incomplète ou invalide : la maquette conserve ses coordonnées locales.";
    case "unknown-crs":
      return `Le système de coordonnées « ${crs} » n’est pas reconnu comme une projection : l’alignement avec les autres maquettes n’est pas garanti.`;
    case "out-of-area":
      return `Les coordonnées cartographiques ne correspondent pas au territoire du système « ${crs} » ou de celui du dossier : la maquette conserve ses coordonnées locales.`;
    case "missing-grid":
      return `La conversion depuis « ${crs} » nécessite une grille indisponible : la maquette conserve ses coordonnées locales.`;
    case "approximate-datum":
      return `La conversion depuis « ${crs} » est approchée, à quelques mètres près.`;
    case "assumed-map-coordinates":
      return "La géométrie est déjà en coordonnées cartographiques : la conversion déclarée ou absente a été adaptée.";
    case "different-vertical-datum":
      return "La référence d’altitude diffère de celle du dossier : les hauteurs ne sont pas converties.";
  }
}

/** A single model has nothing to be superimposed with. */
const needsAnotherModel = new Set<IfcPositioningIssue>([
  "no-georeference",
  "site-only",
]);

export function describeModelWarnings(model: Model, modelCount: number) {
  const warnings = (model.positioningIssues ?? [])
    .filter((issue) => modelCount > 1 || !needsAnotherModel.has(issue))
    .map((issue) =>
      describeIssue(issue, model.georeferencing?.crs ?? "non renseigné"),
    );
  if (model.skippedElements)
    warnings.push(
      `${model.skippedElements} élément(s) trop longs à calculer ne sont pas affichés.`,
    );
  return warnings;
}

const listedModels = 3;

/** One notification for the whole project; the layer panel keeps every detail. */
export function summarizeModelWarnings(models: readonly Model[]) {
  const affected = models.flatMap((model) => {
    const warnings = describeModelWarnings(model, models.length);
    return warnings.length ? [`${model.fileName} : ${warnings.join(" ")}`] : [];
  });
  const hidden = affected.length - listedModels;
  return [
    ...affected.slice(0, listedModels),
    ...(hidden > 0
      ? [`${hidden} autre(s) maquette(s) : voir le panneau des maquettes.`]
      : []),
  ].join(" ");
}
