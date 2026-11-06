"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import { useState } from "react";
import type { ProjectAccessOverview } from "@mnemo/contracts/project-access";
import { RoleEditor } from "./role-editor";
import { MemberEditor } from "./member-editor";
import { InvitationEditor } from "./invitation-editor";
import { PendingInvitation } from "./pending-invitation";

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
            Inviter une personne
          </Button>
        </div>
        {showMemberForm ? (
          <InvitationEditor projectId={projectId} roles={overview.roles} />
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
        {overview.invitations.length > 0 ? (
          <div className="mt-8">
            <h3>Invitations en attente ({overview.invitations.length})</h3>
            <p className="text-sm text-[var(--text-mention-grey)]">
              L&apos;accès sera accordé quand la personne acceptera son
              invitation.
            </p>
            <ul className="m-0 list-none border-t border-[var(--border-default-grey)] p-0">
              {overview.invitations.map((invitation) => (
                <PendingInvitation
                  key={invitation.id}
                  invitation={invitation}
                  projectId={projectId}
                />
              ))}
            </ul>
          </div>
        ) : null}
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
