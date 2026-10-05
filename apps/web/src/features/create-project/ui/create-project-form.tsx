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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function submit() {
    setPending(true);
    setError(false);
    try {
      const project = await createProject({ name, description });
      onCreated(project);
      setName("");
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
        <p className={styles.eyebrow}>NOUVEL ESPACE</p>
        <h2>Créer un projet</h2>
        <p className={styles.intro}>
          Regroupez les maquettes, relevés et remarques d’une même opération.
        </p>
      </div>

      <div className="fr-input-group">
        <label className="fr-label" htmlFor="project-name">
          Nom du projet
          <span className="fr-hint-text">2 à 160 caractères</span>
        </label>
        <input
          className="fr-input"
          id="project-name"
          maxLength={160}
          minLength={2}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex. Hôtel de la Marine"
          required
          value={name}
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
        disabled={pending || name.trim().length < 2}
        iconId="fr-icon-add-line"
        nativeButtonProps={{ type: "submit" }}
      >
        {pending ? "Création…" : "Créer le projet"}
      </Button>
    </form>
  );
}
