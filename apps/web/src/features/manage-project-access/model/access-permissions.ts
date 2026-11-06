import type { ProjectPermission } from "@mnemo/domain/project";
import {
  assignableProjectPermissions,
  isAssignableProjectPermission,
} from "@mnemo/domain/project";

export const permissionLabels: Record<ProjectPermission, string> = {
  "project:read": "Consulter le dossier",
  "project:update": "Modifier le dossier",
  "project:delete": "Supprimer le dossier",
  "member:manage": "Gérer les membres",
  "asset:create": "Ajouter des fichiers",
  "asset:delete": "Supprimer des fichiers",
  "bcf:read": "Consulter les BCF",
  "bcf:topic:create": "Créer des sujets BCF",
  "bcf:topic:update": "Modifier les sujets BCF",
  "bcf:comment:create": "Ajouter des commentaires BCF",
  "bcf:viewpoint:create": "Ajouter des points de vue BCF",
};

export type AssignablePermission =
  (typeof assignableProjectPermissions)[number];

export const permissionGroups = [
  {
    title: "Dossier et fichiers",
    permissions: ["project:update", "asset:create", "asset:delete"],
  },
  {
    title: "Sujets BCF",
    permissions: [
      "bcf:topic:create",
      "bcf:topic:update",
      "bcf:comment:create",
      "bcf:viewpoint:create",
    ],
  },
] as const satisfies ReadonlyArray<{
  title: string;
  permissions: ReadonlyArray<AssignablePermission>;
}>;

export function baseRoleLabel(role: "owner" | "editor" | "viewer") {
  return role === "owner"
    ? "Propriétaire"
    : role === "editor"
      ? "Édition"
      : "Lecture";
}

export function editablePermissions(
  permissions: ProjectPermission[],
): AssignablePermission[] {
  return permissions.filter(isAssignableProjectPermission);
}
