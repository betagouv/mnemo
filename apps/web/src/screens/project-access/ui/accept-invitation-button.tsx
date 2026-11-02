"use client";

import Alert from "@codegouvfr/react-dsfr/Alert";
import Button from "@codegouvfr/react-dsfr/Button";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { acceptProjectInvitation } from "@/server/project-access/actions";

export function AcceptInvitationButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function accept() {
    setPending(true);
    setError(false);
    try {
      const projectId = await acceptProjectInvitation(token);
      router.replace(`/projets/${projectId}`);
      router.refresh();
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <>
      {error ? (
        <Alert
          className="mb-4"
          severity="error"
          small
          description="Impossible d'accepter cette invitation. Le lien a peut-être expiré ou déjà été utilisé."
        />
      ) : null}
      <Button disabled={pending} onClick={() => void accept()}>
        {pending ? "Veuillez patienter…" : "Accepter l'invitation"}
      </Button>
    </>
  );
}
