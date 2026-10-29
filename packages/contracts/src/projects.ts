import { z } from "zod";
import { projectPermissions, projectRoles } from "@mnemo/domain/project";

export const projectIdSchema = z.uuid();
export type ProjectId = z.infer<typeof projectIdSchema>;

export const getProjectInputSchema = z.object({
  projectId: projectIdSchema,
});

export const deleteProjectInputSchema = getProjectInputSchema;

export type GetProjectInput = z.infer<typeof getProjectInputSchema>;

export const projectRoleSchema = z.enum(projectRoles);
export const projectPermissionSchema = z.enum(projectPermissions);

export const createProjectInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Le titre doit contenir au moins 2 caractères.")
    .max(160, "Le titre ne peut pas dépasser 160 caractères."),
  address: z
    .string()
    .trim()
    .max(320, "L’adresse ne peut pas dépasser 320 caractères.")
    .optional(),
  description: z
    .string()
    .trim()
    .max(2_000, "La description ne peut pas dépasser 2 000 caractères.")
    .optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = createProjectInputSchema.extend({
  projectId: projectIdSchema,
});

export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const projectSummarySchema = z.object({
  id: projectIdSchema,
  title: z.string(),
  address: z.string().nullable(),
  description: z.string().nullable(),
  role: projectRoleSchema,
  permissions: z.array(projectPermissionSchema),
  assetCount: z.number().int().nonnegative(),
  ifcCount: z.number().int().nonnegative(),
  pointCloudCount: z.number().int().nonnegative(),
  processingCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  totalSizeBytes: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const projectListSchema = z.array(projectSummarySchema);
export type ProjectList = z.infer<typeof projectListSchema>;
