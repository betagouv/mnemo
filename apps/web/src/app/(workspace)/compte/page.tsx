import type { Metadata } from "next";

import { AccountScreen } from "@/screens/account";
import { resolvePageActor } from "@/server/auth/resolve-actor";
import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { getProjectInvitationService } from "@/server/project-access/project-invitation-service-factory";

export const metadata: Metadata = { title: "Mon compte" };
export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string }>;
}) {
  const actor = await resolvePageActor();
  const [{ vue }, user, invitations] = await Promise.all([
    searchParams,
    getRuntimePrismaDatabase().users.findUniqueOrThrow({
      where: { id: actor.id },
      select: { display_name: true, email: true, email_verified: true },
    }),
    getProjectInvitationService().listForAccount(actor.id),
  ]);
  return (
    <AccountScreen
      name={user.display_name}
      email={user.email}
      emailVerified={user.email_verified}
      view={vue === "invitations" ? "invitations" : "profile"}
      invitations={invitations.map((invitation) => ({
        id: invitation.id,
        projectTitle: invitation.projectTitle,
        invitedBy: invitation.invitedBy,
        baseRole: invitation.baseRole,
        expiresOn: invitation.expiresAt.toLocaleDateString("fr-FR"),
      }))}
    />
  );
}
