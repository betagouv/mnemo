import { z } from "zod";

export const viewerFilterSchema = z
  .object({
    ifcClass: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe("Classe IFC exacte, par exemple IfcWall ou IfcColumn"),
    storeyName: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional()
      .describe("Nom du niveau tel que renvoyé par inspect_scene"),
    storeyExpressId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Express ID exact d’un IfcBuildingStorey"),
  })
  .refine(
    ({ ifcClass, storeyName, storeyExpressId }) =>
      Boolean(ifcClass || storeyName || storeyExpressId),
    "Au moins un critère BIM est requis",
  );

export const sceneStyleGroupSchema = z.object({
  filter: viewerFilterSchema,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe("Couleur RGB hexadécimale, par exemple #6A5ACD"),
});

export const inspectSceneParameters = z.object({});

export const queryElementsParameters = z.object({
  filter: viewerFilterSchema,
  limit: z.number().int().min(1).max(200).default(50),
});

export const setSceneStyleParameters = z.object({
  groups: z.array(sceneStyleGroupSchema).min(1).max(12),
  focus: z
    .boolean()
    .default(false)
    .describe(
      "True pour isoler les groupes. Le reste suit le réglage local de contexte, invisible ou transparent.",
    ),
  label: z.string().trim().min(1).max(160).optional(),
});

export const hideElementsParameters = z.object({
  filters: z.array(viewerFilterSchema).min(1).max(12),
  label: z.string().trim().min(1).max(160).optional(),
});

export const selectElementParameters = z.object({
  expressId: z.number().int().positive(),
  frame: z.boolean().default(true),
});

export const frameViewParameters = z.object({
  target: z.enum(["all", "selection"]),
});

export const resetSceneParameters = z.object({});

export type ViewerFilterInput = z.infer<typeof viewerFilterSchema>;
export type SceneStyleInput = z.infer<typeof setSceneStyleParameters>;
