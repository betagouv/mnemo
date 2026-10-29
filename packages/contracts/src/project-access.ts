import { assignableProjectPermissions } from "@mnemo/domain/project";
import { z } from "zod";

import { projectIdSchema } from "./projects";

export const assignablePermissionSchema = z.enum(
  assignableProjectPermissions as [
    (typeof assignableProjectPermissions)[number],
    ...(typeof assignableProjectPermissions)[number][],
  ],
);

const permissionListSchema = z.array(assignablePermissionSchema).max(20);
const roleIdsSchema = z.array(z.uuid()).max(20);
const baseRoleSchema = z.enum(["viewer", "editor"]);

export const createProjectRoleInputSchema = z.object({
  projectId: projectIdSchema,
  name: z.string().trim().min(2).max(80),
  permissions: permissionListSchema.min(1),
});

export const updateProjectRoleInputSchema = createProjectRoleInputSchema.extend(
  {
    roleId: z.uuid(),
  },
);

export const deleteProjectRoleInputSchema = z.object({
  projectId: projectIdSchema,
  roleId: z.uuid(),
});

export const setMemberAccessInputSchema = z.object({
  projectId: projectIdSchema,
  userId: z.uuid(),
  baseRole: baseRoleSchema,
  roleIds: roleIdsSchema,
  permissions: permissionListSchema,
});

export const removeMemberInputSchema = z.object({
  projectId: projectIdSchema,
  userId: z.uuid(),
});

export const addMemberInputSchema = z.object({
  projectId: projectIdSchema,
  email: z.email().max(320),
  baseRole: baseRoleSchema,
  roleIds: roleIdsSchema,
  permissions: permissionListSchema,
});

export type CreateProjectRoleInput = z.infer<
  typeof createProjectRoleInputSchema
>;
export type UpdateProjectRoleInput = z.infer<
  typeof updateProjectRoleInputSchema
>;
export type DeleteProjectRoleInput = z.infer<
  typeof deleteProjectRoleInputSchema
>;
export type SetMemberAccessInput = z.infer<typeof setMemberAccessInputSchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberInputSchema>;
export type AddMemberInput = z.infer<typeof addMemberInputSchema>;
