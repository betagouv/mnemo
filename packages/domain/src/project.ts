export const projectRoles = ["owner", "editor", "viewer"] as const;

export type ProjectRole = (typeof projectRoles)[number];

export const projectPermissions = [
  "project:read",
  "project:update",
  "project:delete",
  "member:manage",
  "asset:create",
  "asset:delete",
  "bcf:write",
] as const;

export type ProjectPermission = (typeof projectPermissions)[number];

const permissionsByRole = {
  owner: new Set<ProjectPermission>(projectPermissions),
  editor: new Set<ProjectPermission>([
    "project:read",
    "project:update",
    "asset:create",
    "asset:delete",
    "bcf:write",
  ]),
  viewer: new Set<ProjectPermission>(["project:read"]),
} satisfies Record<ProjectRole, ReadonlySet<ProjectPermission>>;

export function hasProjectPermission(
  role: ProjectRole,
  permission: ProjectPermission,
) {
  return permissionsByRole[role].has(permission);
}
