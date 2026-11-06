"use client";

import { permissionGroups } from "../model/access-permissions";
import Checkbox from "@codegouvfr/react-dsfr/Checkbox";
import type { CustomProjectRole } from "@mnemo/contracts/project-access";
import {
  permissionLabels,
  type AssignablePermission,
} from "../model/access-permissions";

export function PermissionPicker({
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

export function RolePicker({
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
