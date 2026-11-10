import { z } from "zod";

export const userRolesSchema = z
  .array(z.enum(["user", "admin"]))
  .min(1)
  .max(2)
  .refine(
    (roles) => roles.includes("user") && new Set(roles).size === roles.length,
    "Le rôle utilisateur est obligatoire et les rôles doivent être uniques.",
  );
export type UserRole = z.infer<typeof userRolesSchema>[number];

export const accountQuerySchema = z.object({
  search: z.string().trim().max(160).default(""),
  status: z.enum(["pending", "approved", "all"]).default("pending"),
  page: z.number().int().min(0).max(100_000).default(0),
  pageSize: z
    .union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)])
    .default(25),
  sortBy: z.enum(["name", "email", "createdAt"]).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});
export type AccountQuery = z.infer<typeof accountQuerySchema>;
export const approveAccountSchema = z.object({ userId: z.uuid() });
export const updateUserRolesSchema = approveAccountSchema.extend({
  roles: userRolesSchema,
});
export type AdminUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  roles: UserRole[];
  createdAt: string;
  approvedAt: string | null;
};
export type AdminUserList = {
  users: AdminUser[];
  total: number;
  pendingCount: number;
};
export type AccountCommandResult = { ok: true } | { ok: false; error: string };
