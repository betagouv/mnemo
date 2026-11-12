import { z } from "zod";

export const bimFilterRuleSchema = z.object({
  id: z.uuid(),
  enabled: z.boolean(),
  action: z.enum(["isolate", "hide", "color"]),
  query: z
    .object({
      ifcClasses: z.array(z.string().regex(/^Ifc[A-Za-z0-9]{1,80}$/)).max(200),
      storeyIds: z.array(z.number().int().positive().max(2147483647)).max(500),
    })
    .refine(
      (query) => query.ifcClasses.length + query.storeyIds.length > 0,
      "Choisissez au moins une classe ou un niveau.",
    ),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export const bimFilterGroupSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  rules: z.array(bimFilterRuleSchema).max(200),
});
export const bimFilterSettingsSchema = z
  .object({
    groups: z.array(bimFilterGroupSchema).max(50),
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
    if (groups.reduce((count, group) => count + group.rules.length, 0) > 500)
      context.addIssue({
        code: "custom",
        message: "La maquette peut contenir au plus 500 filtres.",
      });
  });
export const saveBimFiltersSchema = z.object({
  projectId: z.uuid(),
  assetId: z.uuid(),
  version: z.number().int().min(0).max(2147483646),
  settings: bimFilterSettingsSchema,
});
export type BimFilterRule = z.infer<typeof bimFilterRuleSchema>;
export type BimFilterGroup = z.infer<typeof bimFilterGroupSchema>;
export type BimFilterSettings = z.infer<typeof bimFilterSettingsSchema>;
export type SaveBimFiltersInput = z.infer<typeof saveBimFiltersSchema>;
export type SavedBimFilters = Omit<SaveBimFiltersInput, "projectId">;
