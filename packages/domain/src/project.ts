export const projectRoles = ["owner", "editor", "viewer"] as const;

export type ProjectRole = (typeof projectRoles)[number];

export const projectPermissions = [
  "project:read",
  "project:update",
  "project:delete",
  "member:manage",
  "asset:create",
  "asset:delete",
  "bcf:read",
  "bcf:topic:create",
  "bcf:topic:update",
  "bcf:comment:create",
  "bcf:viewpoint:create",
] as const;

export type ProjectPermission = (typeof projectPermissions)[number];

export const assignableProjectPermissions = projectPermissions.filter(
  (permission) =>
    permission !== "project:read" &&
    permission !== "project:delete" &&
    permission !== "member:manage" &&
    permission !== "bcf:read",
);

export function isAssignableProjectPermission(
  value: string,
): value is (typeof assignableProjectPermissions)[number] {
  return (assignableProjectPermissions as readonly string[]).includes(value);
}

export type ProjectAccess = {
  role: ProjectRole;
  permissions?: ProjectPermission[];
};

export function isProjectPermission(value: string): value is ProjectPermission {
  return (projectPermissions as readonly string[]).includes(value);
}

const permissionsByRole = {
  owner: new Set<ProjectPermission>(projectPermissions),
  editor: new Set<ProjectPermission>([
    "project:read",
    "project:update",
    "asset:create",
    "asset:delete",
    "bcf:read",
    "bcf:topic:create",
    "bcf:topic:update",
    "bcf:comment:create",
    "bcf:viewpoint:create",
  ]),
  viewer: new Set<ProjectPermission>(["project:read", "bcf:read"]),
} satisfies Record<ProjectRole, ReadonlySet<ProjectPermission>>;

export function hasProjectPermission(
  access: ProjectRole | ProjectAccess,
  permission: ProjectPermission,
) {
  const role = typeof access === "string" ? access : access.role;
  return (
    permissionsByRole[role].has(permission) ||
    (typeof access !== "string" &&
      (access.permissions?.includes(permission) ?? false))
  );
}
