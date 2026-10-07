"use client";

import { useMemo, useState } from "react";

import { ProjectCard } from "@/entities/project";
import { ProjectMetadataModal } from "@/features/manage-project-metadata";

import type { ProjectsWorkspaceProps } from "./projects-screen";
import styles from "./projects-screen.module.css";

export function ProjectsWorkspace({ initialProjects }: ProjectsWorkspaceProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return projects
      .filter((project) =>
        `${project.title} ${project.address ?? ""}`
          .toLocaleLowerCase("fr")
          .includes(query),
      )
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title, "fr")
          : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      );
  }, [projects, search, sort]);
  const fileCount = projects.reduce(
    (sum, project) => sum + project.assetCount,
    0,
  );

  return (
    <div className="fr-container pb-16 pt-8">
      <header
        className={`${styles.heading} my-10 mb-6 flex flex-col items-stretch justify-between gap-6 min-[769px]:flex-row min-[769px]:items-end`}
      >
        <div>
          <h1>Mes dossiers</h1>
          <p>
            {projects.length} {projects.length > 1 ? "dossiers" : "dossier"} ·{" "}
            {fileCount} {fileCount > 1 ? "fichiers" : "fichier"}
          </p>
        </div>
        <ProjectMetadataModal
          onSaved={(project) => setProjects((current) => [project, ...current])}
        />
      </header>

      <div className="mb-6 flex flex-col items-stretch justify-between gap-6 min-[769px]:flex-row min-[769px]:items-start">
        <div className="fr-input-group flex-1">
          <label className="fr-label" htmlFor="project-search">
            Rechercher un dossier
          </label>
          <input
            className="fr-input"
            id="project-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Titre ou adresse"
            type="search"
            value={search}
          />
        </div>
        <div className="fr-select-group min-w-0 min-[769px]:min-w-60">
          <label className="fr-label" htmlFor="project-sort">
            Trier par
          </label>
          <select
            className="fr-select"
            id="project-sort"
            onChange={(event) =>
              setSort(event.target.value as "recent" | "title")
            }
            value={sort}
          >
            <option value="recent">Modification récente</option>
            <option value="title">Titre (A–Z)</option>
          </select>
        </div>
      </div>

      {projects.length === 0 ? (
        <div
          className={`${styles.empty} border border-dashed border-[var(--border-default-grey)] px-6 py-12 text-center`}
        >
          <span className="fr-icon-folder-2-line" aria-hidden="true" />
          <h2>Aucun dossier pour le moment</h2>
          <p>Créez votre premier dossier pour y rassembler vos fichiers.</p>
        </div>
      ) : visibleProjects.length === 0 ? (
        <p role="status">Aucun dossier ne correspond à votre recherche.</p>
      ) : (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-6"
          aria-label="Liste des dossiers"
        >
          {visibleProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
