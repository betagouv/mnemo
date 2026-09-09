"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useTRPCClient } from "@/shared/api/trpc";

import styles from "./delete-project-button.module.css";

export function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const client = useTRPCClient();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function deleteProject() {
    if (
      !window.confirm(
        `Supprimer le projet « ${projectName} », ses fichiers et toutes ses données ?`,
      )
    ) {
      return;
    }

    setPending(true);
    try {
      await client.projects.delete.mutate({ projectId });
      router.push("/projets");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className={styles.button}
      disabled={pending}
      onClick={() => void deleteProject()}
      type="button"
    >
      <span className="fr-icon-delete-line" aria-hidden="true" />
      {pending ? "Suppression…" : "Supprimer le projet"}
    </button>
  );
}
