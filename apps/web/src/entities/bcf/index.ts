import type { BcfTopic, BcfTopicSummary } from "@mnemo/contracts/bcf";
export const bcfLabels: Record<string, string> = {
  Open: "Actif",
  "In Progress": "En cours",
  Resolved: "Résolu",
  Closed: "Fermé",
  Issue: "Problème",
  Request: "Demande",
  Information: "Information",
  Low: "Basse",
  Normal: "Normale",
  High: "Haute",
  Critical: "Critique",
};
export function bcfLabel(value: string) {
  return bcfLabels[value] ?? value;
}
export function summarizeTopic(topic: BcfTopic): BcfTopicSummary {
  const { comments, viewpoints, components: _components, ...summary } = topic;
  void _components;
  return {
    ...summary,
    commentCount: comments.length,
    viewpointCount: viewpoints.length,
  };
}
export function bcfDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export { ViewpointDraft } from "./viewpoint-draft";
export { BcfSnapshot } from "./snapshot";

export { readBcfWorkspace } from "./api/bcf-workspace";
