"use client";

import type { BcfTopic } from "@mnemo/contracts/bcf";
import type {
  AssistantThreadHistory,
  AssistantThreadSummary,
} from "@mnemo/contracts/assistant";
import Link from "next/link";
import { useState } from "react";

import { IfcElementProperties } from "@/entities/ifc-element";
import { IfcAssistantPanel } from "@/features/interact-with-ifc-assistant";
import { BcfTopicsPanel } from "@/features/manage-bcf-topics";
import { useProjectScene } from "../model/use-project-scene";
import type {
  ViewerIfcSource,
  ViewerPointCloudFailure,
  ViewerPointCloudSource,
} from "../model/viewer-sources";

import styles from "./ifc-viewer.module.css";
import { ProjectLayers } from "./project-layers";
import { ViewCube } from "./view-cube";

type AssistantSession = {
  threads: AssistantThreadSummary[];
  history: AssistantThreadHistory | null;
};

const phaseLabels = {
  idle: "En attente",
  initializing: "Préparation de la vue 3D",
  downloading: "Téléchargement de l’IFC",
  processing: "Construction de la scène",
  ready: "Projet prêt",
  error: "Chargement impossible",
  device_lost: "Affichage 3D interrompu",
} as const;

export function ProjectViewer({
  assistantSessions,
  assistantConfigured,
  assistantMcpConfigured,
  ifcSources,
  initialBcfTopics,
  pointCloudFailures,
  pointCloudSources,
  projectId,
  projectName,
}: {
  assistantSessions: Record<string, AssistantSession>;
  assistantConfigured: boolean;
  assistantMcpConfigured: boolean;
  ifcSources: ViewerIfcSource[];
  initialBcfTopics: BcfTopic[];
  pointCloudFailures: ViewerPointCloudFailure[];
  pointCloudSources: ViewerPointCloudSource[];
  projectId: string;
  projectName: string;
}) {
  const {
    canvasRef,
    controllerRef,
    snapshot,
    getViewer,
    retrying,
    accessError,
    failedAssetId,
    pointBudget,
    hiddenPointCloudIds,
    pointCloudConfigurations,
    updatePointCloudConfiguration,
    setPointCloudVisible,
    reloadPointClouds,
    retry,
  } = useProjectScene({ ifcSources, pointCloudSources, projectId });
  const [inspectorMode, setInspectorMode] = useState<
    "properties" | "bcf" | "assistant"
  >("properties");
  const [bcfTopicCount, setBcfTopicCount] = useState(initialBcfTopics.length);

  const activeModelId = snapshot.activeModelId;
  const activeIfcSource = ifcSources.find(
    (source) => source.assetId === activeModelId,
  );
  const failedSource = ifcSources.find(
    (source) =>
      source.assetId === failedAssetId ||
      snapshot.models.some(
        (model) => model.assetId === source.assetId && model.phase === "error",
      ),
  );

  const isBusy =
    snapshot.phase === "initializing" ||
    snapshot.phase === "downloading" ||
    snapshot.phase === "processing";
  const hasFailed =
    snapshot.phase === "error" || snapshot.phase === "device_lost";

  return (
    <main className={styles.shell}>
      <header className={styles.toolbar}>
        <div className={styles.identity}>
          <Link
            aria-label={`Retour au projet ${projectName}`}
            className={styles.back}
            href={`/projets/${projectId}`}
          >
            <span className="fr-icon-arrow-left-line" aria-hidden="true" />
          </Link>
          <div>
            <small>Scène du projet</small>
            <h1 title={projectName}>{projectName}</h1>
          </div>
        </div>

        <div className={styles.actions}>
          <span className={styles.phase} data-phase={snapshot.phase}>
            <i aria-hidden="true" />
            {phaseLabels[snapshot.phase]}
          </span>
          <button
            className={styles.actionButton}
            disabled={snapshot.phase !== "ready"}
            onClick={() => controllerRef.current?.fitToView()}
            type="button"
          >
            <span className="fr-icon-focus-3-line" aria-hidden="true" />
            Tout cadrer
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside
          className={styles.explorerColumn}
          aria-label="Explorateur du projet"
        >
          <ProjectLayers
            getViewer={getViewer}
            hiddenPointCloudIds={hiddenPointCloudIds}
            ifcSources={ifcSources}
            onPointBudgetChange={(maxPoints) =>
              void reloadPointClouds(maxPoints)
            }
            onPointCloudConfigurationChange={updatePointCloudConfiguration}
            onPointSizeChange={(pointSize) =>
              controllerRef.current?.setPointCloudPointSize(pointSize)
            }
            onPointCloudVisibilityChange={setPointCloudVisible}
            pointBudget={pointBudget}
            pointCloudConfigurations={pointCloudConfigurations}
            pointCloudFailures={pointCloudFailures}
            pointSize={snapshot.pointCloudOptions.pointSize}
            projectId={projectId}
            snapshot={snapshot}
          />
        </aside>

        <section
          className={styles.viewport}
          aria-label="Visionneuse 3D du projet"
        >
          <canvas
            aria-label={`Vue 3D du projet ${projectName}`}
            className={styles.canvas}
            ref={canvasRef}
          />

          {snapshot.meshCount > 0 ||
          snapshot.pointClouds.some((cloud) => cloud.pointCount > 0) ? (
            <ViewCube
              getViewer={getViewer}
              phase={snapshot.phase}
              projectId={projectId}
            />
          ) : null}

          {isBusy ? (
            <div className={styles.loadCard} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <div>
                <strong>{phaseLabels[snapshot.phase]}</strong>
                <p>
                  {snapshot.phase === "processing"
                    ? `${snapshot.meshCount.toLocaleString("fr-FR")} maillages reçus`
                    : "Préparation de la maquette…"}
                </p>
                {snapshot.parserPercent !== null ? (
                  <progress max={100} value={snapshot.parserPercent} />
                ) : null}
              </div>
            </div>
          ) : null}

          {snapshot.phase === "ready" ? (
            <div className={styles.modelStats} role="status">
              <strong>{snapshot.entityCount?.toLocaleString("fr-FR")}</strong>
              <span>entités IFC</span>
              <i aria-hidden="true" />
              <strong>{snapshot.meshCount.toLocaleString("fr-FR")}</strong>
              <span>maillages</span>
              {snapshot.pointClouds.length ? (
                <>
                  <i aria-hidden="true" />
                  <strong>
                    {snapshot.pointClouds
                      .reduce((total, cloud) => total + cloud.pointCount, 0)
                      .toLocaleString("fr-FR")}
                  </strong>
                  <span>points</span>
                </>
              ) : null}
            </div>
          ) : null}

          {hasFailed || accessError || pointCloudFailures.length ? (
            <div className={styles.errorCard} role="alert">
              <span className="fr-icon-error-warning-fill" aria-hidden="true" />
              <div>
                <strong>
                  {snapshot.phase === "ready"
                    ? "Chargement partiel"
                    : phaseLabels[snapshot.phase]}
                </strong>
                {hasFailed || accessError ? (
                  <p>{accessError ?? snapshot.message}</p>
                ) : null}
                {pointCloudFailures.length ? (
                  <p>
                    Nuage indisponible :{" "}
                    {pointCloudFailures
                      .map((failure) => failure.fileName)
                      .join(", ")}
                    . Les autres couches restent disponibles.
                  </p>
                ) : null}
                {failedSource ? (
                  <button
                    disabled={retrying}
                    onClick={() => void retry(failedSource)}
                    type="button"
                  >
                    {retrying ? "Nouvel essai…" : "Réessayer"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className={styles.help}>
            <span>Clic : sélectionner</span>
            <span>Glisser : orbiter</span>
            <span>Maj ou clic milieu : déplacer</span>
            <span>Molette : zoomer</span>
          </div>
        </section>

        <aside className={styles.inspector} aria-label="Inspecteur BIM">
          <header className={styles.inspectorHeader}>
            <div className={styles.inspectorTabs} role="tablist">
              <button
                aria-selected={inspectorMode === "properties"}
                onClick={() => setInspectorMode("properties")}
                role="tab"
                type="button"
              >
                Propriétés
              </button>
              <button
                aria-selected={inspectorMode === "bcf"}
                onClick={() => setInspectorMode("bcf")}
                role="tab"
                type="button"
              >
                BCF <span>{bcfTopicCount}</span>
              </button>
              <button
                aria-selected={inspectorMode === "assistant"}
                onClick={() => setInspectorMode("assistant")}
                role="tab"
                type="button"
              >
                Assistant
              </button>
            </div>
            {inspectorMode === "properties" && snapshot.selection ? (
              <button
                className={styles.frameButton}
                aria-label="Cadrer l’élément sélectionné"
                onClick={() => controllerRef.current?.frameSelection()}
                title="Cadrer l’élément"
                type="button"
              >
                <span className="fr-icon-focus-3-line" aria-hidden="true" />
              </button>
            ) : null}
          </header>

          <div className={styles.inspectorBody} data-mode={inspectorMode}>
            {activeIfcSource ? (
              <IfcAssistantPanel
                assetId={activeIfcSource.assetId}
                configured={assistantConfigured}
                getViewer={getViewer}
                hidden={inspectorMode !== "assistant"}
                initialHistory={
                  assistantSessions[activeIfcSource.assetId]?.history ?? null
                }
                initialThreads={
                  assistantSessions[activeIfcSource.assetId]?.threads ?? []
                }
                key={activeIfcSource.assetId}
                mcpConfigured={assistantMcpConfigured}
                projectId={projectId}
              />
            ) : null}
            {inspectorMode === "assistant" ? (
              activeIfcSource ? null : (
                <p className={styles.inspectorState}>
                  Ajoutez une maquette IFC pour utiliser l’assistant.
                </p>
              )
            ) : inspectorMode === "bcf" ? (
              <BcfTopicsPanel
                assetId={activeModelId ?? ""}
                canCaptureViewpoint={
                  snapshot.phase === "ready" && Boolean(activeModelId)
                }
                initialTopics={initialBcfTopics}
                onApplyViewpoint={(data, targetDistance) => {
                  controllerRef.current?.applyBcfViewpoint(
                    data,
                    targetDistance,
                  );
                  setInspectorMode("properties");
                }}
                onCaptureViewpoint={() => {
                  const controller = controllerRef.current;
                  if (!controller) {
                    return Promise.reject(
                      new Error("La visionneuse n’est pas prête."),
                    );
                  }
                  return controller.captureBcfViewpoint();
                }}
                onFocusComponent={(assetId, expressId) => {
                  controllerRef.current?.setActiveModel(assetId);
                  controllerRef.current?.selectEntity(expressId);
                  controllerRef.current?.frameSelection();
                  setInspectorMode("properties");
                }}
                onTopicCountChange={setBcfTopicCount}
                projectId={projectId}
                selection={snapshot.selection}
                availableIfcAssetIds={ifcSources.map(
                  (source) => source.assetId,
                )}
              />
            ) : snapshot.selectionPhase === "loading" ? (
              <p className={styles.inspectorState}>Lecture des propriétés…</p>
            ) : snapshot.selectionPhase === "error" ? (
              <p className={styles.inspectorError}>
                {snapshot.selectionMessage ??
                  "Les propriétés n’ont pas pu être lues."}
              </p>
            ) : snapshot.selection ? (
              <IfcElementProperties element={snapshot.selection} />
            ) : (
              <div className={styles.inspectorEmpty}>
                <span className="fr-icon-cursor-line" aria-hidden="true" />
                <strong>Sélectionnez un élément</strong>
                <p>
                  Cliquez sur la maquette pour afficher son identité IFC et ses
                  jeux de propriétés.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
