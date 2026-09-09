"use client";

import { useState } from "react";

import { ProjectCard } from "@/entities/project";
import { CreateProjectForm } from "@/features/create-project";

import type { ProjectsWorkspaceProps } from "./projects-screen";
import styles from "./projects-screen.module.css";

export function ProjectsWorkspace({ initialProjects }: ProjectsWorkspaceProps) {
  const [projects, setProjects] = useState(initialProjects);

  return (
    <div className={`fr-container ${styles.page}`}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>ESPACE DE TRAVAIL</p>
          <h1>Vos projets</h1>
          <p>
            Retrouvez les opérations auxquelles vous participez et reprenez le
            travail là où vous l’aviez laissé.
          </p>
        </div>
        <div
          className={styles.count}
          aria-label={`${projects.length} ${projects.length > 1 ? "projets" : "projet"}`}
        >
          <strong>{projects.length}</strong>
          <span>{projects.length > 1 ? "projets" : "projet"}</span>
        </div>
      </header>

      <div className={styles.layout}>
        <section aria-labelledby="project-list-title">
          <div className={styles.listHeading}>
            <h2 id="project-list-title">Projets récents</h2>
            <span>Triés par dernière modification</span>
          </div>
          {projects.length === 0 ? (
            <div className={styles.empty}>
              <span className="fr-icon-folder-2-line" aria-hidden="true" />
              <h2>Aucun projet pour le moment</h2>
              <p>
                Créez votre premier espace pour préparer l’import d’un IFC ou
                d’un nuage de points.
              </p>
            </div>
          ) : (
            <div className={styles.list}>
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </section>

        <aside aria-label="Créer un projet">
          <CreateProjectForm
            onCreated={(project) =>
              setProjects((current) => [
                project,
                ...current.filter((item) => item.id !== project.id),
              ])
            }
          />
        </aside>
      </div>
    </div>
  );
}
