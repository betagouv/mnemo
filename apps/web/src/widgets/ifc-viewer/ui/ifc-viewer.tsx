"use client";

import {
  IfcViewerController,
  type LoadIfcInput,
  type IfcViewerSnapshot,
} from "@mnemo/ifc-viewer-adapter";
import type { PointCloudSettings } from "@mnemo/contracts/point-clouds";
import type { BcfTopic } from "@mnemo/contracts/bcf";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { IfcElementProperties } from "@/entities/ifc-element";
import { BimExplorer } from "@/features/filter-bim-model";
import { IfcAssistantPanel } from "@/features/interact-with-ifc-assistant";
import { BcfTopicsPanel } from "@/features/manage-bcf-topics";
import {
  PointCloudPanel,
  type PointCloudConfiguration,
} from "@/features/configure-point-cloud";
import { useTRPCClient } from "@/shared/api/trpc";

import styles from "./ifc-viewer.module.css";

const initialSnapshot: IfcViewerSnapshot = {
  phase: "idle",
  parserPercent: null,
  meshCount: 0,
  entityCount: null,
  message: null,
  selection: null,
  selectionPhase: "idle",
  selectionMessage: null,
  catalog: null,
  processing: {
    engine: null,
    cacheKey: null,
    cacheHit: null,
  },
  visual: {
    mode: "all",
    label: null,
    matchCount: 0,
    showContext: true,
    contextOpacity: 0.1,
  },
  pointClouds: [],
  pointCloudOptions: {
    pointSize: 2,
  },
};

const initialPointBudget = 2_000_000;

export type ViewerPointCloudSource = {
  assetId: string;
  fileName: string;
  downloadUrl: string;
  settings: PointCloudSettings;
};

function hexToRgba(hex: string): [number, number, number, number] {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
    1,
  ];
}

const phaseLabels = {
  idle: "En attente",
  initializing: "Initialisation WebGPU",
  downloading: "Téléchargement de l’IFC",
  processing: "Construction de la scène",
  ready: "Maquette prête",
  error: "Chargement impossible",
  device_lost: "Périphérique WebGPU perdu",
} as const;

export function IfcViewer({
  assetId,
  assetName,
  assistantConfigured,
  assistantMcpConfigured,
  initialBcfTopics,
  initialDownloadUrl,
  processing,
  pointCloudSources,
  projectId,
  projectName,
}: {
  assetId: string;
  assetName: string;
  assistantConfigured: boolean;
  assistantMcpConfigured: boolean;
  initialBcfTopics: BcfTopic[];
  initialDownloadUrl: string;
  processing: NonNullable<LoadIfcInput["processing"]>;
  pointCloudSources: ViewerPointCloudSource[];
  projectId: string;
  projectName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<IfcViewerController>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [retrying, setRetrying] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [inspectorMode, setInspectorMode] = useState<
    "properties" | "bcf" | "assistant"
  >("properties");
  const [bcfTopicCount, setBcfTopicCount] = useState(initialBcfTopics.length);
  const [pointBudget, setPointBudget] = useState(initialPointBudget);
  const [pointCloudConfigurations, setPointCloudConfigurations] = useState<
    PointCloudConfiguration[]
  >(() =>
    pointCloudSources.map((source) => ({
      assetId: source.assetId,
      fileName: source.fileName,
      transform: source.settings.transform,
      sourceCrs: source.settings.sourceCrs,
      targetCrs: source.settings.targetCrs,
    })),
  );
  const initialProcessingRef = useRef(processing);
  const pointCloudSourcesRef = useRef(pointCloudSources);
  const trpcClient = useTRPCClient();
  const getViewer = useCallback(() => controllerRef.current, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new IfcViewerController(canvas);
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(setSnapshot);
    void controller
      .loadIfc({
        downloadUrl: initialDownloadUrl,
        processing: initialProcessingRef.current,
      })
      .then(() =>
        Promise.allSettled(
          pointCloudSourcesRef.current.map((source) =>
            controller.loadPointCloud({
              assetId: source.assetId,
              fileName: source.fileName,
              downloadUrl: source.downloadUrl,
              maxPointsInMemory: initialPointBudget,
              transform: source.settings.transform,
            }),
          ),
        ),
      )
      .catch(() => undefined);

    return () => {
      unsubscribe();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [initialDownloadUrl]);

  function updatePointCloudConfiguration(
    configuration: PointCloudConfiguration,
  ) {
    setPointCloudConfigurations((current) =>
      current.map((item) =>
        item.assetId === configuration.assetId ? configuration : item,
      ),
    );
    controllerRef.current?.setPointCloudTransform(
      configuration.assetId,
      configuration.transform,
    );
  }

  async function reloadPointClouds(maxPointsInMemory: number) {
    const controller = controllerRef.current;
    if (!controller) return;

    setPointBudget(maxPointsInMemory);
    await Promise.allSettled(
      pointCloudSourcesRef.current.map(async (source) => {
        const access = await trpcClient.assets.open.query({
          assetId: source.assetId,
          projectId,
        });
        const configuration = pointCloudConfigurations.find(
          (item) => item.assetId === source.assetId,
        );
        await controller.loadPointCloud({
          assetId: source.assetId,
          fileName: source.fileName,
          downloadUrl: access.downloadUrl,
          maxPointsInMemory,
          transform: configuration?.transform ?? source.settings.transform,
        });
      }),
    );
  }

  const retry = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller) return;

    setRetrying(true);
    setAccessError(null);

    try {
      const access = await trpcClient.assets.open.query({ assetId, projectId });
      await controller.loadIfc({
        downloadUrl: access.downloadUrl,
        processing,
      });
    } catch {
      if (controller.getSnapshot().phase !== "error") {
        setAccessError(
          "Impossible d’obtenir un nouvel accès au fichier original.",
        );
      }
    } finally {
      setRetrying(false);
    }
  }, [assetId, processing, projectId, trpcClient]);

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
            <small>{projectName}</small>
            <h1 title={assetName}>{assetName}</h1>
          </div>
        </div>

        <div className={styles.actions}>
          <span className={styles.phase} data-phase={snapshot.phase}>
            <i aria-hidden="true" />
            {phaseLabels[snapshot.phase]}
          </span>
          {snapshot.processing.engine ? (
            <span className={styles.engine}>
              {snapshot.processing.engine === "rust"
                ? "Rust + Parquet"
                : "Navigateur WASM"}
              {snapshot.processing.cacheHit === true ? " · cache" : ""}
            </span>
          ) : null}
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
        {snapshot.catalog ? (
          <BimExplorer
            catalog={snapshot.catalog}
            onColor={(query, color, label) =>
              controllerRef.current?.color(query, hexToRgba(color), label)
            }
            onColorByStorey={() => controllerRef.current?.colorByStorey()}
            onHide={(query, label) => controllerRef.current?.hide(query, label)}
            onIsolate={(query, label) =>
              controllerRef.current?.isolate(query, label)
            }
            onReset={() => controllerRef.current?.resetVisuals()}
            onSetContext={(show, opacity) =>
              controllerRef.current?.setIsolationContext(show, opacity)
            }
            visual={snapshot.visual}
          />
        ) : (
          <aside className={styles.explorerPlaceholder} aria-hidden="true" />
        )}

        <section className={styles.viewport} aria-label="Visionneuse IFC 3D">
          <canvas
            aria-label={`Vue 3D de ${assetName}`}
            className={styles.canvas}
            ref={canvasRef}
          />

          {isBusy ? (
            <div className={styles.loadCard} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <div>
                <strong>{phaseLabels[snapshot.phase]}</strong>
                <p>
                  {snapshot.phase === "processing"
                    ? `${snapshot.meshCount.toLocaleString("fr-FR")} maillages reçus${snapshot.processing.engine === "rust" ? " du serveur Rust" : ""}`
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

          {pointCloudConfigurations.length ? (
            <PointCloudPanel
              configurations={pointCloudConfigurations}
              maxPoints={pointBudget}
              onConfigurationChange={updatePointCloudConfiguration}
              onPointSizeChange={(pointSize) =>
                controllerRef.current?.setPointCloudPointSize(pointSize)
              }
              onReload={(maxPoints) => void reloadPointClouds(maxPoints)}
              pointClouds={snapshot.pointClouds}
              pointSize={snapshot.pointCloudOptions.pointSize}
              projectId={projectId}
            />
          ) : null}

          {hasFailed || accessError ? (
            <div className={styles.errorCard} role="alert">
              <span className="fr-icon-error-warning-fill" aria-hidden="true" />
              <div>
                <strong>{phaseLabels[snapshot.phase]}</strong>
                <p>{accessError ?? snapshot.message}</p>
                <button
                  disabled={retrying}
                  onClick={() => void retry()}
                  type="button"
                >
                  {retrying ? "Nouvel essai…" : "Réessayer"}
                </button>
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
            <IfcAssistantPanel
              assetId={assetId}
              configured={assistantConfigured}
              getViewer={getViewer}
              hidden={inspectorMode !== "assistant"}
              mcpConfigured={assistantMcpConfigured}
              projectId={projectId}
            />
            {inspectorMode === "assistant" ? null : inspectorMode === "bcf" ? (
              <BcfTopicsPanel
                assetId={assetId}
                canCaptureViewpoint={snapshot.phase === "ready"}
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
                onFocusComponent={(expressId) => {
                  controllerRef.current?.selectEntity(expressId);
                  controllerRef.current?.frameSelection();
                  setInspectorMode("properties");
                }}
                onTopicCountChange={setBcfTopicCount}
                projectId={projectId}
                selection={snapshot.selection}
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
