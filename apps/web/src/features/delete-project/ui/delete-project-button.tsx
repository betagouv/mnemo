"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteProject as deleteProjectAction } from "@/server/projects/actions";

import styles from "./delete-project-button.module.css";

export function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function deleteProject() {
    if (
      !window.confirm(
        `Supprimer le dossier « ${projectName} », ses fichiers et toutes ses données ?`,
      )
    ) {
      return;
    }

    setPending(true);
    try {
      await deleteProjectAction({ projectId });
      router.push("/projets");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      className={styles.button}
      disabled={pending}
      iconId="fr-icon-delete-line"
      onClick={() => void deleteProject()}
      priority="tertiary"
    >
      {pending ? "Suppression…" : "Supprimer le dossier"}
    </Button>
  );
}
