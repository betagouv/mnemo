import { z } from "zod";

export const bimFilterQuerySchema = z.object({
  ifcClasses: z.array(z.string().regex(/^Ifc[A-Za-z0-9]{1,80}$/)).max(200),
  storeys: z
    .array(
      z.object({
        assetId: z.uuid(),
        storeyId: z.number().int().positive().max(2147483647),
      }),
    )
    .max(500),
});
export const bimFilterRuleSchema = z
  .object({
    id: z.uuid(),
    enabled: z.boolean(),
    action: z.enum(["isolate", "hide", "color"]),
    query: bimFilterQuerySchema,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .refine(
    (rule) => !rule.enabled || hasBimFilterCriteria(rule.query),
    "Choisissez au moins une classe ou un niveau pour activer le filtre.",
  );
export const bimFilterGroupSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean(),
    assetIds: z.array(z.uuid()).max(500),
    rules: z.array(bimFilterRuleSchema),
  })
  .superRefine((group, context) => {
    if (new Set(group.assetIds).size !== group.assetIds.length)
      context.addIssue({
        code: "custom",
        message: "Maquettes ciblées dupliquées.",
      });
    if (group.enabled && !group.assetIds.length)
      context.addIssue({
        code: "custom",
        message: "Choisissez une maquette pour activer le groupe.",
      });
    if (
      group.rules.some((rule) =>
        rule.query.storeys.some(
          (level) => !group.assetIds.includes(level.assetId),
        ),
      )
    )
      context.addIssue({
        code: "custom",
        message: "Chaque niveau doit appartenir à une maquette ciblée.",
      });
  });
export const bimFilterSettingsSchema = z
  .object({
    groups: z.array(bimFilterGroupSchema),
    showContext: z.boolean(),
    contextOpacity: z.number().min(0.02).max(0.5),
  })
  .superRefine(({ groups }, context) => {
    const ids = [
      ...groups.map((group) => group.id),
      ...groups.flatMap((group) => group.rules.map((rule) => rule.id)),
    ];
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        message: "Identifiants de filtres dupliqués.",
      });
  });
export const saveBimFiltersSchema = z.object({
  projectId: z.uuid(),
  version: z.number().int().min(0).max(2147483646),
  settings: bimFilterSettingsSchema,
});
export type BimFilterQuery = z.infer<typeof bimFilterQuerySchema>;
export type BimFilterRule = z.infer<typeof bimFilterRuleSchema>;
export type BimFilterGroup = z.infer<typeof bimFilterGroupSchema>;
export type BimFilterSettings = z.infer<typeof bimFilterSettingsSchema>;
export type SaveBimFiltersInput = z.infer<typeof saveBimFiltersSchema>;
export type SavedBimFilters = SaveBimFiltersInput;

export function hasBimFilterCriteria(query: BimFilterQuery) {
  return query.ifcClasses.length + query.storeys.length > 0;
}

export function retargetBimFilterGroup(
  group: BimFilterGroup,
  assetIds: string[],
): BimFilterGroup {
  return {
    ...group,
    assetIds,
    enabled: group.enabled && assetIds.length > 0,
    rules: group.rules.map((rule) => {
      const query = {
        ...rule.query,
        storeys: rule.query.storeys.filter((level) =>
          assetIds.includes(level.assetId),
        ),
      };
      return {
        ...rule,
        query,
        enabled: rule.enabled && hasBimFilterCriteria(query),
      };
    }),
  };
}

export function removeBimFilterAsset(
  settings: BimFilterSettings,
  assetId: string,
): BimFilterSettings {
  return {
    ...settings,
    groups: settings.groups.map((group) =>
      retargetBimFilterGroup(
        group,
        group.assetIds.filter((id) => id !== assetId),
      ),
    ),
  };
}
