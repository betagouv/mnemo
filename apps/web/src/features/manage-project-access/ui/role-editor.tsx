"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import Input from "@codegouvfr/react-dsfr/Input";
import { useState } from "react";
import type { CustomProjectRole } from "@mnemo/contracts/project-access";
import {
  createProjectRole,
  deleteProjectRole,
  updateProjectRole,
} from "@/server/project-access/actions";
import {
  permissionLabels,
  editablePermissions,
  type AssignablePermission,
} from "../model/access-permissions";
import { useProjectAccessAction } from "../model/use-project-access-action";
import { PermissionPicker } from "./access-pickers";
import { Feedback } from "./access-feedback";

export function RoleEditor({
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
  const { pending, error, success, run } = useProjectAccessAction();

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
