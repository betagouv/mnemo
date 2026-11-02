"use client";

import Alert from "@codegouvfr/react-dsfr/Alert";
import Button from "@codegouvfr/react-dsfr/Button";
import SideMenu from "@codegouvfr/react-dsfr/SideMenu";
import Tag from "@codegouvfr/react-dsfr/Tag";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/shared/lib/auth-client";
import {
  acceptAccountProjectInvitation,
  declineAccountProjectInvitation,
} from "@/server/project-access/actions";

type AccountInvitation = {
  id: string;
  projectTitle: string;
  invitedBy: string;
  baseRole: "viewer" | "editor";
  expiresOn: string;
};

function InvitationItem({ invitation }: { invitation: AccountInvitation }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function act(action: "accept" | "decline") {
    setPending(true);
    setError(false);
    try {
      if (action === "accept") {
        const projectId = await acceptAccountProjectInvitation(invitation.id);
        router.push(`/projets/${projectId}`);
      } else {
        await declineAccountProjectInvitation(invitation.id);
        router.refresh();
      }
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="border-b border-[var(--border-default-grey)] py-6 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="mb-2 text-lg">{invitation.projectTitle}</h3>
          <p className="mb-2 text-sm text-[var(--text-mention-grey)]">
            Invitation de {invitation.invitedBy} · valable jusqu&apos;au{" "}
            {invitation.expiresOn}
          </p>
          <Tag as="span" small>
            {invitation.baseRole === "editor" ? "Édition" : "Lecture"}
          </Tag>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            nativeButtonProps={{
              onClick: () => void act("accept"),
              type: "button",
            }}
            size="small"
          >
            Accepter
          </Button>
          <Button
            disabled={pending}
            nativeButtonProps={{
              onClick: () => void act("decline"),
              type: "button",
            }}
            priority="secondary"
            size="small"
          >
            Refuser
          </Button>
        </div>
      </div>
      {error ? (
        <Alert
          className="mt-4"
          severity="error"
          small
          description="Cette invitation n'est plus disponible. Actualisez la page et réessayez."
        />
      ) : null}
    </li>
  );
}

export function AccountScreen({
  name,
  email,
  emailVerified,
  view,
  invitations,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
  view: "profile" | "invitations";
  invitations: AccountInvitation[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <main className="fr-container py-10">
      <h1>Mon compte</h1>
      <div className="grid gap-8 md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside>
          <SideMenu
            burgerMenuButtonText="Menu du compte"
            items={[
              {
                text: "Informations personnelles",
                linkProps: { href: "/compte" },
                isActive: view === "profile",
              },
              {
                text: `Invitations (${invitations.length})`,
                linkProps: { href: "/compte?vue=invitations" },
                isActive: view === "invitations",
              },
            ]}
            title="Mon compte"
          />
        </aside>
        <section className="min-w-0" aria-labelledby="account-section-title">
          {view === "profile" ? (
            <>
              <h2 id="account-section-title">Informations personnelles</h2>
              <p className="mb-2 font-bold">{name}</p>
              <p>
                {email} · adresse {emailVerified ? "vérifiée" : "non vérifiée"}
              </p>
              <Button
                disabled={pending}
                iconId="fr-icon-logout-box-r-line"
                nativeButtonProps={{
                  onClick: async () => {
                    setPending(true);
                    await authClient.signOut();
                    router.replace("/connexion");
                    router.refresh();
                  },
                  type: "button",
                }}
                priority="secondary"
              >
                Se déconnecter
              </Button>
            </>
          ) : (
            <>
              <h2 id="account-section-title">
                Invitations en attente ({invitations.length})
              </h2>
              {invitations.length ? (
                <ul className="m-0 list-none border-t border-[var(--border-default-grey)] p-0">
                  {invitations.map((invitation) => (
                    <InvitationItem
                      invitation={invitation}
                      key={invitation.id}
                    />
                  ))}
                </ul>
              ) : (
                <p>Vous n&apos;avez aucune invitation en attente.</p>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
