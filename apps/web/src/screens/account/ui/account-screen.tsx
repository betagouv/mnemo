"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/shared/lib/auth-client";

export function AccountScreen({
  name,
  email,
  emailVerified,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <div className="fr-container py-10">
      <h1>Mon compte</h1>
      <p>{name}</p>
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
    </div>
  );
}
