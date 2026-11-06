import { z } from "zod";

export const floorPlanPresetSchema = z.enum([
  "default",
  "architectural",
  "fire-safety",
  "structural",
  "mep",
]);
export const floorPlanRuleSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  ifcType: z.string().regex(/^Ifc[A-Za-z0-9]{1,80}$/),
  fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  strokeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  lineWeight: z.number().min(0.05).max(2),
});
export const floorPlanStyleSchema = z.object({
  preset: floorPlanPresetSchema,
  rules: z
    .array(floorPlanRuleSchema)
    .max(50)
    .refine(
      (rules) => new Set(rules.map((rule) => rule.id)).size === rules.length,
      "Identifiants de règles dupliqués.",
    ),
});
export const floorPlanContextSchema = z.object({ projectId: z.uuid() });
export const saveFloorPlanSchema = floorPlanContextSchema.extend({
  target: z
    .object({ id: z.uuid(), version: z.number().int().positive() })
    .optional(),
  name: z.string().trim().min(1).max(160),
  assetId: z.uuid(),
  storeyId: z.number().int().positive().max(2147483647),
  storeyName: z.string().trim().min(1).max(512),
  style: floorPlanStyleSchema,
});
export const deleteFloorPlanSchema = floorPlanContextSchema.extend({
  id: z.uuid(),
  version: z.number().int().positive(),
});
export type FloorPlanRule = z.infer<typeof floorPlanRuleSchema>;
export type FloorPlanStyleSettings = z.infer<typeof floorPlanStyleSchema>;
export type SaveFloorPlanInput = z.infer<typeof saveFloorPlanSchema>;
export type DeleteFloorPlanInput = z.infer<typeof deleteFloorPlanSchema>;
export type SavedFloorPlan = Omit<SaveFloorPlanInput, "target"> & {
  id: string;
  version: number;
  updatedAt: string;
};
