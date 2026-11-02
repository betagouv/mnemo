import Alert from "@codegouvfr/react-dsfr/Alert";
import Button from "@codegouvfr/react-dsfr/Button";
import type { Metadata } from "next";

import { AcceptInvitationButton } from "@/screens/project-access";
import { getCurrentActor } from "@/server/auth/resolve-actor";
import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { getProjectInvitationService } from "@/server/project-access/project-invitation-service-factory";

export const metadata: Metadata = { title: "Invitation à un dossier" };
export const dynamic = "force-dynamic";

export default async function InvitationPage({
  params,
}: PageProps<"/invitations/[token]">) {
  const { token } = await params;
  const invitation = await getProjectInvitationService().preview(token);
  const actor = await getCurrentActor();
  const user = actor
    ? await getRuntimePrismaDatabase().users.findUnique({
        where: { id: actor.id },
        select: { email: true },
      })
    : null;
  const invitationPath = `/invitations/${encodeURIComponent(token)}`;
  const returnQuery = `?retour=${encodeURIComponent(invitationPath)}`;

  return (
    <main className="fr-container flex min-h-[65vh] items-center py-10">
      <div className="mx-auto w-full max-w-[38rem]">
        <h1>Invitation à un dossier</h1>
        {!invitation ? (
          <>
            <Alert
              className="mb-6"
              severity="warning"
              small
              description="Cette invitation est expirée, a déjà été utilisée ou a été annulée. Demandez un nouveau lien au propriétaire du dossier."
            />
            <Button linkProps={{ href: "/projets" }}>Mes dossiers</Button>
          </>
        ) : (
          <>
            <p>
              Vous êtes invité à rejoindre le dossier{" "}
              <strong>{invitation.projectTitle}</strong> avec l&apos;adresse{" "}
              <strong>{invitation.email}</strong>.
            </p>
            {!actor ? (
              <>
                <p>
                  Connectez-vous ou créez un compte avec cette adresse, puis
                  acceptez l&apos;invitation.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button linkProps={{ href: `/connexion${returnQuery}` }}>
                    Se connecter
                  </Button>
                  <Button
                    priority="secondary"
                    linkProps={{ href: `/inscription${returnQuery}` }}
                  >
                    Créer un compte
                  </Button>
                </div>
              </>
            ) : user?.email.toLowerCase() !== invitation.email ? (
              <Alert
                severity="warning"
                small
                description={`Vous êtes connecté avec ${user?.email ?? "un autre compte"}. Déconnectez-vous, puis utilisez le compte ${invitation.email} pour accepter cette invitation.`}
              />
            ) : (
              <AcceptInvitationButton token={token} />
            )}
            <p className="mt-6 text-sm text-[var(--text-mention-grey)]">
              Ce lien est personnel et valable jusqu&apos;au{" "}
              {invitation.expiresAt.toLocaleDateString("fr-FR")}.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
