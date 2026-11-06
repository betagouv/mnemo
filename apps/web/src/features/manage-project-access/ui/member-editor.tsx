"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import Select from "@codegouvfr/react-dsfr/Select";
import Tag from "@codegouvfr/react-dsfr/Tag";
import { useState } from "react";
import type {
  CustomProjectRole,
  ProjectMemberAccess,
} from "@mnemo/contracts/project-access";
import {
  removeProjectMember,
  setMemberAccess,
} from "@/server/project-access/actions";
import {
  baseRoleLabel,
  editablePermissions,
  type AssignablePermission,
} from "../model/access-permissions";
import { useProjectAccessAction } from "../model/use-project-access-action";
import { PermissionPicker, RolePicker } from "./access-pickers";
import { Feedback } from "./access-feedback";

export function MemberEditor({
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
  const { pending, error, success, run } = useProjectAccessAction();
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
