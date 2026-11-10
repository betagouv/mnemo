"use client";
import Alert from "@codegouvfr/react-dsfr/Alert";
import Button from "@codegouvfr/react-dsfr/Button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/shared/lib/auth-client";

export function PendingAccountScreen({ email }: { email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <main className="fr-container py-12">
      <div className="mx-auto max-w-[42rem]">
        <h1>Votre compte est en attente d&apos;approbation</h1>
        <Alert
          severity="info"
          title="Votre adresse e-mail est confirmée"
          description={`Votre demande pour ${email} doit maintenant être approuvée par un administrateur. Vous recevrez un e-mail lorsque votre compte sera approuvé.`}
        />
        <div className="mt-6 flex flex-wrap gap-4">
          <Button onClick={() => router.refresh()}>Actualiser le statut</Button>
          <Button
            priority="secondary"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await authClient.signOut();
                router.replace("/connexion");
                router.refresh();
              } finally {
                setPending(false);
              }
            }}
          >
            Se déconnecter
          </Button>
        </div>
      </div>
    </main>
  );
}
