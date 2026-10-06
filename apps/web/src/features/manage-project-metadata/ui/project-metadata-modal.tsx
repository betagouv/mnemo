"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import { createModal } from "@codegouvfr/react-dsfr/Modal";
import type { ProjectSummary } from "@mnemo/contracts/projects";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createProject, updateProject } from "@/server/projects/actions";

import styles from "./project-metadata-modal.module.css";

const modal = createModal({
  id: "project-metadata-modal",
  isOpenedByDefault: false,
});
const Modal = modal.Component;

export function ProjectMetadataModal({
  project,
  onSaved,
}: {
  project?: ProjectSummary;
  onSaved?: (project: ProjectSummary) => void;
}) {
  const router = useRouter();
  const isEditing = project !== undefined;
  const [title, setTitle] = useState(project?.title ?? "");
  const [address, setAddress] = useState(project?.address ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  function open() {
    setTitle(project?.title ?? "");
    setAddress(project?.address ?? "");
    setDescription(project?.description ?? "");
    setError(false);
    modal.open();
  }

  async function submit() {
    setPending(true);
    setError(false);
    try {
      const saved = project
        ? await updateProject({
            projectId: project.id,
            title,
            address,
            description,
          })
        : await createProject({ title, address, description });
      modal.close();
      onSaved?.(saved);
      if (isEditing) router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        iconId={isEditing ? "fr-icon-edit-line" : "fr-icon-add-line"}
        priority={isEditing ? "secondary" : "primary"}
        nativeButtonProps={{ type: "button", onClick: open }}
      >
        {isEditing ? "Modifier le dossier" : "Nouveau dossier"}
      </Button>

      <Modal
        className={styles.modal}
        title={isEditing ? "Modifier le dossier" : "Créer un dossier"}
        titleAs="h2"
      >
        <form
          aria-busy={pending}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="fr-input-group">
            <label className="fr-label" htmlFor="project-title">
              Titre du dossier
              <span className="fr-hint-text">2 à 160 caractères</span>
            </label>
            <input
              className="fr-input"
              id="project-title"
              maxLength={160}
              minLength={2}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex. Hôtel de la Marine"
              required
              value={title}
            />
          </div>

          <div className="fr-input-group">
            <label className="fr-label" htmlFor="project-address">
              Adresse
              <span className="fr-hint-text">
                Facultatif · bâtiment ou site concerné
              </span>
            </label>
            <input
              className="fr-input"
              id="project-address"
              maxLength={320}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Ex. 2 place de la Concorde, Paris"
              value={address}
            />
          </div>

          <div className="fr-input-group">
            <label className="fr-label" htmlFor="project-description">
              Description
              <span className="fr-hint-text">Facultatif</span>
            </label>
            <textarea
              className={`fr-input ${styles.textarea}`}
              id="project-description"
              maxLength={2_000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Contexte, bâtiment, phase de l’opération…"
              value={description}
            />
          </div>

          {error && (
            <p className={styles.error} role="alert">
              Le dossier n’a pas pu être {isEditing ? "modifié" : "créé"}.
              Réessayez.
            </p>
          )}

          <div className={styles.actions}>
            <Button
              disabled={pending}
              priority="secondary"
              nativeButtonProps={{ type: "button", onClick: modal.close }}
            >
              Annuler
            </Button>
            <Button
              disabled={pending || title.trim().length < 2}
              nativeButtonProps={{ type: "submit" }}
            >
              {pending
                ? "Enregistrement…"
                : isEditing
                  ? "Enregistrer"
                  : "Créer le dossier"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
