"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import type { ProjectAccessOverview } from "@mnemo/contracts/project-access";
import { revokeProjectInvitation } from "@/server/project-access/actions";
import { baseRoleLabel } from "../model/access-permissions";
import { useProjectAccessAction } from "../model/use-project-access-action";
import { Feedback } from "./access-feedback";

export function PendingInvitation({
  projectId,
  invitation,
}: {
  projectId: string;
  invitation: ProjectAccessOverview["invitations"][number];
}) {
  const { pending, error, success, run } = useProjectAccessAction();
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-default-grey)] py-4 last:border-0">
      <div>
        <p className="mb-1 font-bold">{invitation.email}</p>
        <p className="mb-0 text-sm text-[var(--text-mention-grey)]">
          {baseRoleLabel(invitation.baseRole)} · expire le{" "}
          {new Date(invitation.expiresAt).toLocaleDateString("fr-FR")}
        </p>
        <Feedback error={error} success={success} />
      </div>
      <Button
        disabled={pending}
        priority="secondary"
        size="small"
        nativeButtonProps={{
          onClick: () =>
            void run(
              () =>
                revokeProjectInvitation({
                  projectId,
                  invitationId: invitation.id,
                }),
              "Invitation annulée.",
            ),
          type: "button",
        }}
      >
        Annuler l&apos;invitation
      </Button>
    </li>
  );
}
