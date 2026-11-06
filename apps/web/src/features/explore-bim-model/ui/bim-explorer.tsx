"use client";

import type {
  IfcBimCatalog,
  IfcBimQuery,
  IfcVisualSnapshot,
} from "@mnemo/ifc-viewer-adapter";
import { useMemo, useState } from "react";
import styles from "./bim-explorer.module.css";

function queryLabel(
  catalog: IfcBimCatalog,
  ifcClass: string,
  storeyId: string,
) {
  const storey = catalog.storeys.find(
    (item) => item.expressId === Number(storeyId),
  );
  if (ifcClass && storey) return `${ifcClass} · ${storey.name}`;
  return ifcClass || storey?.name || "Toute la maquette";
}

export function BimExplorer({
  catalog,
  visual,
  onColor,
  onColorByStorey,
  onHide,
  onIsolate,
  onReset,
  onSetContext,
}: {
  catalog: IfcBimCatalog;
  visual: IfcVisualSnapshot;
  onColor: (query: IfcBimQuery, color: string, label: string) => void;
  onColorByStorey: () => void;
  onHide: (query: IfcBimQuery, label: string) => void;
  onIsolate: (query: IfcBimQuery, label: string) => void;
  onReset: () => void;
  onSetContext: (show: boolean, opacity: number) => void;
}) {
  const [ifcClass, setIfcClass] = useState("");
  const [storeyId, setStoreyId] = useState("");
  const [color, setColor] = useState("#6a6af4");
  const query = useMemo<IfcBimQuery>(
    () => ({
      ifcClass: ifcClass || null,
      storeyId: storeyId ? Number(storeyId) : null,
    }),
    [ifcClass, storeyId],
  );
  const label = queryLabel(catalog, ifcClass, storeyId);
  const hasCriteria = Boolean(ifcClass || storeyId);

  return (
    <div className={styles.explorer}>
      <div className={styles.body}>
        <section>
          <div className={styles.sectionTitle}>
            <h2>Filtrer la maquette</h2>
            {visual.mode !== "all" ? (
              <button onClick={onReset} type="button">
                Réinitialiser
              </button>
            ) : null}
          </div>

          <label htmlFor="viewer-ifc-class">Classe IFC</label>
          <select
            id="viewer-ifc-class"
            onChange={(event) => setIfcClass(event.target.value)}
            value={ifcClass}
          >
            <option value="">Toutes les classes</option>
            {catalog.types.map((type) => (
              <option key={type.ifcClass} value={type.ifcClass}>
                {type.ifcClass} ({type.elementCount.toLocaleString("fr-FR")})
              </option>
            ))}
          </select>

          <label htmlFor="viewer-storey">Niveau</label>
          <select
            id="viewer-storey"
            onChange={(event) => setStoreyId(event.target.value)}
            value={storeyId}
          >
            <option value="">Tous les niveaux</option>
            {catalog.storeys.map((storey) => (
              <option key={storey.expressId} value={storey.expressId}>
                {storey.name} ({storey.elementCount.toLocaleString("fr-FR")})
              </option>
            ))}
          </select>

          <div className={styles.actions}>
            <button
              disabled={!hasCriteria}
              onClick={() => onIsolate(query, label)}
              type="button"
            >
              Afficher
            </button>
            <button
              disabled={!hasCriteria}
              onClick={() => onHide(query, label)}
              type="button"
            >
              Masquer
            </button>
          </div>

          <div className={styles.colorAction}>
            <label htmlFor="viewer-color">Couleur</label>
            <input
              aria-label="Couleur des éléments"
              id="viewer-color"
              onChange={(event) => setColor(event.target.value)}
              type="color"
              value={color}
            />
            <button
              disabled={!hasCriteria}
              onClick={() => onColor(query, color, label)}
              type="button"
            >
              Appliquer
            </button>
          </div>
        </section>

        <section>
          <h2>Niveaux</h2>
          {catalog.storeys.length ? (
            <ul className={styles.storeys}>
              {catalog.storeys.map((storey) => (
                <li key={storey.expressId}>
                  <button
                    onClick={() => {
                      const storeyQuery = { storeyId: storey.expressId };
                      setStoreyId(String(storey.expressId));
                      onIsolate(storeyQuery, storey.name);
                    }}
                    type="button"
                  >
                    <span>{storey.name}</span>
                    <small>
                      {storey.elevation !== null
                        ? `${storey.elevation.toLocaleString("fr-FR")} m · `
                        : ""}
                      {storey.elementCount.toLocaleString("fr-FR")}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>Aucun IfcBuildingStorey trouvé.</p>
          )}
          <button
            className={styles.paletteButton}
            disabled={!catalog.storeys.length}
            onClick={onColorByStorey}
            type="button"
          >
            Palette par niveau
          </button>
        </section>

        <section>
          <h2>Contexte d’isolation</h2>
          <label className={styles.check}>
            <input
              checked={visual.showContext}
              onChange={(event) =>
                onSetContext(event.target.checked, visual.contextOpacity)
              }
              type="checkbox"
            />
            Afficher le reste en transparence
          </label>
          <div className={styles.opacity}>
            <input
              aria-label="Opacité du contexte"
              disabled={!visual.showContext}
              max="0.5"
              min="0.02"
              onChange={(event) =>
                onSetContext(visual.showContext, Number(event.target.value))
              }
              step="0.01"
              type="range"
              value={visual.contextOpacity}
            />
            <strong>{Math.round(visual.contextOpacity * 100)} %</strong>
          </div>
          <p>
            Ce réglage reste local. Désactivé, le contexte est réellement
            masqué.
          </p>
        </section>

        {visual.mode !== "all" ? (
          <div className={styles.active} role="status">
            <small>Vue active</small>
            <strong>{visual.label}</strong>
            <span>{visual.matchCount.toLocaleString("fr-FR")} éléments</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
