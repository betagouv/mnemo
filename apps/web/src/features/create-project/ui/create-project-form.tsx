"use client";

import type { ProjectSummary } from "@mnemo/contracts/projects";
import Button from "@codegouvfr/react-dsfr/Button";
import { useState } from "react";

import { createProject } from "@/server/projects/actions";

import styles from "./create-project-form.module.css";

export function CreateProjectForm({
  onCreated,
}: {
  onCreated: (project: ProjectSummary) => void;
}) {
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function submit() {
    setPending(true);
    setError(false);
    try {
      const project = await createProject({ title, address, description });
      onCreated(project);
      setTitle("");
      setAddress("");
      setDescription("");
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div>
        <h2>Créer un dossier</h2>
        <p className={styles.intro}>
          Regroupez les fichiers d’un bâtiment ou d’une opération.
        </p>
      </div>

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

      {error ? (
        <p className={styles.error} role="alert">
          Le projet n’a pas pu être créé. Réessayez dans un instant.
        </p>
      ) : null}

      <Button
        disabled={pending || title.trim().length < 2}
        iconId="fr-icon-add-line"
        nativeButtonProps={{ type: "submit" }}
      >
        {pending ? "Création…" : "Créer le dossier"}
      </Button>
    </form>
  );
}
