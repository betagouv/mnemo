"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import Input from "@codegouvfr/react-dsfr/Input";
import Select from "@codegouvfr/react-dsfr/Select";
import { useState } from "react";
import type { CustomProjectRole } from "@mnemo/contracts/project-access";
import { issueProjectInvitation } from "@/server/project-access/actions";
import { type AssignablePermission } from "../model/access-permissions";
import { useProjectAccessAction } from "../model/use-project-access-action";
import { PermissionPicker, RolePicker } from "./access-pickers";
import { Feedback } from "./access-feedback";

export function InvitationEditor({
  projectId,
  roles,
}: {
  projectId: string;
  roles: CustomProjectRole[];
}) {
  const [email, setEmail] = useState("");
  const [baseRole, setBaseRole] = useState<"viewer" | "editor">("viewer");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<AssignablePermission[]>([]);
  const { pending, error, success, run } = useProjectAccessAction();

  return (
    <form
      className="mb-6 bg-[var(--background-alt-grey)] p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void run(
          () =>
            issueProjectInvitation({
              projectId,
              email,
              baseRole,
              roleIds,
              permissions,
            }),
          "Invitation créée. Son envoi a été accepté par le service de messagerie.",
        ).then((result) => {
          if (result.ok) setEmail("");
        });
      }}
    >
      <h3>Inviter une personne</h3>
      <p className="text-sm">
        Elle recevra un lien personnel valable 7 jours. Si elle n&apos;a pas
        encore de compte Mnemo, elle pourra en créer un avant d&apos;accepter
        l&apos;invitation.
      </p>
      <Feedback error={error} success={success} />
      <Input
        label="Adresse e-mail de la personne"
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
          Envoyer l&apos;invitation
        </Button>
      </div>
    </form>
  );
}
