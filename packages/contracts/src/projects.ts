import { z } from "zod";

export const projectIdSchema = z.uuid();
export type ProjectId = z.infer<typeof projectIdSchema>;

export const projectRoleSchema = z.enum(["owner", "editor", "viewer"]);

export const createProjectInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères.")
    .max(160, "Le nom ne peut pas dépasser 160 caractères."),
  description: z
    .string()
    .trim()
    .max(2_000, "La description ne peut pas dépasser 2 000 caractères.")
    .optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const projectSummarySchema = z.object({
  id: projectIdSchema,
  name: z.string(),
  description: z.string().nullable(),
  role: projectRoleSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const projectListSchema = z.array(projectSummarySchema);
export type ProjectList = z.infer<typeof projectListSchema>;
