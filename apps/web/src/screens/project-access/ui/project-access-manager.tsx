"use client";

import Alert from "@codegouvfr/react-dsfr/Alert";
import Button from "@codegouvfr/react-dsfr/Button";
import Checkbox from "@codegouvfr/react-dsfr/Checkbox";
import Input from "@codegouvfr/react-dsfr/Input";
import Select from "@codegouvfr/react-dsfr/Select";
import Tag from "@codegouvfr/react-dsfr/Tag";
import type { ProjectPermission } from "@mnemo/domain/project";
import {
  assignableProjectPermissions,
  isAssignableProjectPermission,
} from "@mnemo/domain/project";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  CustomProjectRole,
  ProjectAccessOverview,
  ProjectMemberAccess,
} from "@/server/project-access/application/project-access-repository";
import {
  addProjectMember,
  createProjectRole,
  deleteProjectRole,
  removeProjectMember,
  setMemberAccess,
  updateProjectRole,
} from "@/server/project-access/actions";

const permissionLabels: Record<ProjectPermission, string> = {
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

type AssignablePermission = (typeof assignableProjectPermissions)[number];

const permissionGroups = [
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

function baseRoleLabel(role: "owner" | "editor" | "viewer") {
  return role === "owner"
    ? "Propriétaire"
    : role === "editor"
      ? "Édition"
      : "Lecture";
}

function editablePermissions(
  permissions: ProjectPermission[],
): AssignablePermission[] {
  return permissions.filter(isAssignableProjectPermission);
}

function PermissionPicker({
  value,
  onChange,
}: {
  value: AssignablePermission[];
  onChange: (value: AssignablePermission[]) => void;
}) {
  return (
    <div className="mb-5">
      <p className="mb-2 font-medium">Droits supplémentaires</p>
      <p className="mb-4 text-sm text-[var(--text-mention-grey)]">
        Ils s’ajoutent au rôle de base. Le rôle Édition inclut déjà tous ces
        droits.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {permissionGroups.map((group) => (
          <Checkbox
            key={group.title}
            legend={group.title}
            small
            options={group.permissions.map((permission) => ({
              label: permissionLabels[permission],
              nativeInputProps: {
                checked: value.includes(permission),
                onChange: (event) =>
                  onChange(
                    event.target.checked
                      ? [...value, permission]
                      : value.filter((item) => item !== permission),
                  ),
              },
            }))}
          />
        ))}
      </div>
    </div>
  );
}

function RolePicker({
  roles,
  value,
  onChange,
}: {
  roles: CustomProjectRole[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  if (!roles.length) return null;
  return (
    <div className="mb-4">
      <Checkbox
        legend="Rôles personnalisés"
        small
        options={roles.map((role) => ({
          label: role.name,
          nativeInputProps: {
            checked: value.includes(role.id),
            onChange: (event) =>
              onChange(
                event.target.checked
                  ? [...value, role.id]
                  : value.filter((item) => item !== role.id),
              ),
          },
        }))}
      />
    </div>
  );
}

function useActionState() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const result = await action();
      setSuccess(successMessage);
      router.refresh();
      return { ok: true as const, value: result };
    } catch {
      setError("L’opération a échoué. Vérifiez les valeurs et réessayez.");
      return { ok: false as const };
    } finally {
      setPending(false);
    }
  }

  return { pending, error, success, run };
}

function Feedback({ error, success }: { error: string; success: string }) {
  return error ? (
    <Alert className="mb-4" severity="error" small description={error} />
  ) : success ? (
    <Alert className="mb-4" severity="success" small description={success} />
  ) : null;
}

function RoleEditor({
  projectId,
  role,
  onClose,
}: {
  projectId: string;
  role?: CustomProjectRole;
  onClose?: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [permissions, setPermissions] = useState<AssignablePermission[]>(
    editablePermissions(role?.permissions ?? []),
  );
  const [editing, setEditing] = useState(!role);
  const { pending, error, success, run } = useActionState();

  return (
    <div className="border-b border-[var(--border-default-grey)] py-5 last:border-0">
      {role ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="mb-1 text-lg font-bold">{role.name}</h3>
            <p className="mb-0 text-sm text-[var(--text-mention-grey)]">
              {role.permissions
                .map((permission) => permissionLabels[permission])
                .join(" · ")}
            </p>
          </div>
          <Button
            iconId="fr-icon-edit-line"
            priority="tertiary no outline"
            size="small"
            nativeButtonProps={{
              "aria-expanded": editing,
              onClick: () => setEditing(!editing),
              type: "button",
            }}
          >
            Modifier
          </Button>
        </div>
      ) : null}
      {editing ? (
        <form
          className="mt-4 bg-[var(--background-alt-grey)] p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                role
                  ? updateProjectRole({
                      projectId,
                      roleId: role.id,
                      name,
                      permissions,
                    })
                  : createProjectRole({ projectId, name, permissions }),
              role ? "Rôle modifié." : "Rôle créé.",
            ).then((result) => {
              if (result.ok && !role) {
                setName("");
                setPermissions([]);
              }
            });
          }}
        >
          {!role ? <h3>Créer un rôle personnalisé</h3> : null}
          <Feedback error={error} success={success} />
          <Input
            label="Nom du rôle"
            hintText="Par exemple : Commentaire BCF"
            nativeInputProps={{
              maxLength: 80,
              minLength: 2,
              onChange: (event) => setName(event.target.value),
              required: true,
              value: name,
            }}
          />
          <PermissionPicker onChange={setPermissions} value={permissions} />
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={
                pending || name.trim().length < 2 || permissions.length === 0
              }
              nativeButtonProps={{ type: "submit" }}
            >
              {role ? "Enregistrer le rôle" : "Créer le rôle"}
            </Button>
            <Button
              disabled={pending}
              priority="secondary"
              nativeButtonProps={{
                onClick: () => {
                  if (role) setEditing(false);
                  else onClose?.();
                },
                type: "button",
              }}
            >
              Annuler
            </Button>
            {role ? (
              <Button
                disabled={pending}
                priority="tertiary no outline"
                nativeButtonProps={{
                  onClick: () => {
                    if (
                      window.confirm(`Supprimer le rôle « ${role.name} » ?`)
                    ) {
                      void run(
                        () => deleteProjectRole({ projectId, roleId: role.id }),
                        "Rôle supprimé.",
                      );
                    }
                  },
                  type: "button",
                }}
              >
                Supprimer ce rôle
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <Feedback error={error} success={success} />
      )}
    </div>
  );
}

function MemberEditor({
  projectId,
  member,
  roles,
}: {
  projectId: string;
  member: ProjectMemberAccess;
  roles: CustomProjectRole[];
}) {
  const [baseRole, setBaseRole] = useState<"viewer" | "editor">(
    member.baseRole === "editor" ? "editor" : "viewer",
  );
  const [roleIds, setRoleIds] = useState(member.roleIds);
  const [permissions, setPermissions] = useState<AssignablePermission[]>(
    editablePermissions(member.permissions),
  );
  const [editing, setEditing] = useState(false);
  const { pending, error, success, run } = useActionState();
  const assignedRoles = roles.filter((role) =>
    member.roleIds.includes(role.id),
  );

  return (
    <li className="border-b border-[var(--border-default-grey)] py-5 last:border-0">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_11rem] md:items-start">
        <div className="min-w-0">
          <h3 className="mb-1 text-lg font-bold">{member.name}</h3>
          <p className="mb-0 break-all text-sm text-[var(--text-mention-grey)]">
            {member.email}
          </p>
        </div>
        <div>
          <div className="flex flex-wrap gap-2">
            <Tag as="span" small>
              {baseRoleLabel(member.baseRole)}
            </Tag>
            {assignedRoles.map((role) => (
              <Tag as="span" key={role.id} small>
                {role.name}
              </Tag>
            ))}
          </div>
          <p className="mb-0 mt-2 text-sm text-[var(--text-mention-grey)]">
            {member.baseRole === "owner"
              ? "Tous les droits, y compris la gestion des accès."
              : member.baseRole === "editor"
                ? "Modification du dossier, des fichiers et des BCF."
                : "Consultation du dossier et des BCF."}
            {member.permissions.length > 0
              ? ` ${member.permissions.length} droit${member.permissions.length > 1 ? "s" : ""} individuel${member.permissions.length > 1 ? "s" : ""} en plus.`
              : null}
          </p>
        </div>
        {member.baseRole !== "owner" ? (
          <Button
            className="md:justify-self-end"
            priority="secondary"
            size="small"
            nativeButtonProps={{
              "aria-expanded": editing,
              "aria-label": `Modifier l’accès de ${member.name}`,
              onClick: () => setEditing(!editing),
              type: "button",
            }}
          >
            Modifier l’accès
          </Button>
        ) : null}
      </div>
      {editing && member.baseRole !== "owner" ? (
        <form
          className="mt-5 bg-[var(--background-alt-grey)] p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                setMemberAccess({
                  projectId,
                  userId: member.userId,
                  baseRole,
                  roleIds,
                  permissions,
                }),
              "Accès du membre enregistré.",
            ).then((result) => {
              if (result.ok) setEditing(false);
            });
          }}
        >
          <h4 className="mb-5 text-lg">Droits de {member.name}</h4>
          <Feedback error={error} success={success} />
          <Select
            label="Rôle de base"
            hint="Lecture : consulter uniquement. Édition : modifier le dossier, les fichiers et les BCF."
            nativeSelectProps={{
              onChange: (event) =>
                setBaseRole(event.target.value as "viewer" | "editor"),
              value: baseRole,
            }}
          >
            <option value="viewer">Lecture</option>
            <option value="editor">Édition</option>
          </Select>
          <RolePicker onChange={setRoleIds} roles={roles} value={roleIds} />
          <PermissionPicker onChange={setPermissions} value={permissions} />
          <div className="flex flex-wrap gap-3">
            <Button disabled={pending} nativeButtonProps={{ type: "submit" }}>
              Enregistrer les droits
            </Button>
            <Button
              disabled={pending}
              priority="secondary"
              nativeButtonProps={{
                onClick: () => setEditing(false),
                type: "button",
              }}
            >
              Annuler
            </Button>
            <Button
              disabled={pending}
              priority="tertiary no outline"
              nativeButtonProps={{
                onClick: () => {
                  if (window.confirm(`Retirer l’accès de ${member.name} ?`)) {
                    void run(
                      () =>
                        removeProjectMember({
                          projectId,
                          userId: member.userId,
                        }),
                      "Membre retiré.",
                    );
                  }
                },
                type: "button",
              }}
            >
              Retirer du dossier
            </Button>
          </div>
        </form>
      ) : (
        <Feedback error={error} success={success} />
      )}
    </li>
  );
}

function AddMemberEditor({
  projectId,
  roles,
  onClose,
}: {
  projectId: string;
  roles: CustomProjectRole[];
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [baseRole, setBaseRole] = useState<"viewer" | "editor">("viewer");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<AssignablePermission[]>([]);
  const { pending, error, success, run } = useActionState();

  return (
    <form
      className="mb-6 bg-[var(--background-alt-grey)] p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void run(
          () =>
            addProjectMember({
              projectId,
              email,
              baseRole,
              roleIds,
              permissions,
            }),
          "Membre ajouté.",
        ).then((result) => {
          if (result.ok) onClose();
        });
      }}
    >
      <h3>Ajouter un membre</h3>
      <p className="text-sm">
        Cette personne doit déjà avoir créé un compte Mnemo. Les adresses e-mail
        ne sont pas vérifiées dans cette version.
      </p>
      <Feedback error={error} success={success} />
      <Input
        label="Adresse e-mail du compte"
        nativeInputProps={{
          autoComplete: "email",
          maxLength: 320,
          onChange: (event) => setEmail(event.target.value),
          required: true,
          type: "email",
          value: email,
        }}
      />
      <Select
        label="Rôle de base"
        hint="Lecture : consulter uniquement. Édition : modifier le dossier, les fichiers et les BCF."
        nativeSelectProps={{
          onChange: (event) =>
            setBaseRole(event.target.value as "viewer" | "editor"),
          value: baseRole,
        }}
      >
        <option value="viewer">Lecture</option>
        <option value="editor">Édition</option>
      </Select>
      <RolePicker onChange={setRoleIds} roles={roles} value={roleIds} />
      <PermissionPicker onChange={setPermissions} value={permissions} />
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending} nativeButtonProps={{ type: "submit" }}>
          Ajouter le membre
        </Button>
        <Button
          disabled={pending}
          priority="secondary"
          nativeButtonProps={{ onClick: onClose, type: "button" }}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
export function ProjectAccessManager({
  projectId,
  overview,
}: {
  projectId: string;
  overview: ProjectAccessOverview;
}) {
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);

  return (
    <div>
      <section aria-labelledby="members-heading" className="mb-12">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="mb-1" id="members-heading">
              Membres ({overview.members.length})
            </h2>
            <p className="mb-0 text-sm text-[var(--text-mention-grey)]">
              Consultez les accès avant de les modifier.
            </p>
          </div>
          <Button
            iconId="fr-icon-add-line"
            nativeButtonProps={{
              "aria-expanded": showMemberForm,
              onClick: () => setShowMemberForm(!showMemberForm),
              type: "button",
            }}
          >
            Ajouter un membre
          </Button>
        </div>
        {showMemberForm ? (
          <AddMemberEditor
            onClose={() => setShowMemberForm(false)}
            projectId={projectId}
            roles={overview.roles}
          />
        ) : null}
        <ul className="m-0 list-none border-t border-[var(--border-default-grey)] p-0">
          {overview.members.map((member) => (
            <MemberEditor
              key={member.userId}
              member={member}
              projectId={projectId}
              roles={overview.roles}
            />
          ))}
        </ul>
      </section>
      <section
        aria-labelledby="roles-heading"
        className="border-t border-[var(--border-default-grey)] pt-8"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="mb-1" id="roles-heading">
              Rôles personnalisés
            </h2>
            <p className="mb-0 text-sm text-[var(--text-mention-grey)]">
              Un rôle regroupe des droits que vous pouvez attribuer à plusieurs
              membres.
            </p>
          </div>
          <Button
            iconId="fr-icon-add-line"
            priority="secondary"
            nativeButtonProps={{
              "aria-expanded": showRoleForm,
              onClick: () => setShowRoleForm(!showRoleForm),
              type: "button",
            }}
          >
            Créer un rôle
          </Button>
        </div>
        {showRoleForm ? (
          <RoleEditor
            onClose={() => setShowRoleForm(false)}
            projectId={projectId}
          />
        ) : null}
        {overview.roles.length ? (
          <div className="border-t border-[var(--border-default-grey)]">
            {overview.roles.map((role) => (
              <RoleEditor key={role.id} projectId={projectId} role={role} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-mention-grey)]">
            Aucun rôle personnalisé pour le moment. Les rôles Lecture et Édition
            restent disponibles sans configuration.
          </p>
        )}
      </section>
    </div>
  );
}
