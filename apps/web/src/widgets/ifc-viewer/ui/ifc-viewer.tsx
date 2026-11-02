"use client";

import type { BcfTopic } from "@mnemo/contracts/bcf";
import type {
  AssistantThreadHistory,
  AssistantThreadSummary,
} from "@mnemo/contracts/assistant";
import Alert from "@codegouvfr/react-dsfr/Alert";
import { useRef, useState } from "react";

import {
  SectionBoxGizmo,
  SectionPanel,
  SectionPlaneGizmo,
  SectionSketchOverlay,
} from "@/features/control-section";
import { IfcAssistantPanel } from "@/features/interact-with-ifc-assistant";
import { BcfTopicsPanel } from "@/features/manage-bcf-topics";
import { useProjectScene } from "../model/use-project-scene";
import { getActiveViewerModifiers } from "../model/viewer-active-modifiers";
import {
  viewerPanels,
  type ViewerPanelId,
  type ViewerToolGroupId,
} from "../model/viewer-tool-catalog";
import type {
  ViewerIfcSource,
  ViewerPointCloudFailure,
  ViewerPointCloudSource,
} from "../model/viewer-sources";

import styles from "./ifc-viewer.module.css";
import { IfcPropertiesPane } from "./ifc-properties-pane";
import { ProjectLayers } from "./project-layers";
import { ViewCube } from "./view-cube";
import { ViewerActiveModifiers } from "./viewer-active-modifiers";
import { ViewerExplorerSplit } from "./viewer-explorer-split";
import { ViewerSidePanel } from "./viewer-side-panel";
import { ViewerToolBar } from "./viewer-tool-bar";

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

const shellLayout =
  "relative grid h-full w-full min-h-0 min-w-0 overflow-hidden grid-cols-[minmax(0,1fr)] min-[769px]:grid-cols-[15.5rem_minmax(0,1fr)] min-[1201px]:grid-cols-[17.5rem_minmax(0,1fr)]";
const openPanelLayout =
  "min-[769px]:max-[897px]:grid-cols-[minmax(0,1fr)] min-[1025px]:grid-cols-[15.5rem_minmax(0,1fr)_20rem] min-[1201px]:grid-cols-[17.5rem_minmax(0,1fr)_22rem]";

export function ProjectViewer({
  assistantSessions,
  assistantConfigured,
  assistantMcpConfigured,
  bcfPermissions,
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
  bcfPermissions: {
    createTopic: boolean;
    updateTopic: boolean;
    createComment: boolean;
    createViewpoint: boolean;
  };
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
  const [activePanel, setActivePanel] = useState<ViewerPanelId | null>(null);
  const [activeToolGroup, setActiveToolGroup] =
    useState<ViewerToolGroupId | null>(null);
  const [panelFocusRequest, setPanelFocusRequest] = useState(0);
  const [bcfTopicCount, setBcfTopicCount] = useState(initialBcfTopics.length);
  const toolBarRef = useRef<HTMLDivElement>(null);
  const lastPanelTrigger = useRef<HTMLButtonElement | null>(null);

  const activeModelId = snapshot.activeModelId;
  const activeIfcSource = ifcSources.find(
    (source) => source.assetId === activeModelId,
  );
  const activePanelConfig = activePanel ? viewerPanels[activePanel] : null;
  const activeModifiers = getActiveViewerModifiers(snapshot);
  const upcomingDescription =
    activePanelConfig && "upcoming" in activePanelConfig
      ? activePanelConfig.upcoming
      : null;

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

  const openPanel = (
    panel: ViewerPanelId,
    groupId: ViewerToolGroupId,
    trigger: HTMLButtonElement,
  ) => {
    if (
      (activePanel === "cut-plane" || activePanel === "cut-box") &&
      panel !== activePanel
    ) {
      controllerRef.current?.cancelSectionPick();
    }
    lastPanelTrigger.current = trigger;
    setActivePanel(panel);
    setActiveToolGroup(groupId);
    setPanelFocusRequest((request) => request + 1);
  };

  return (
    <main
      className={`${styles.shell} ${shellLayout} ${activePanel ? openPanelLayout : ""}`}
      data-panel-open={Boolean(activePanel)}
    >
      <aside
        className={`${styles.explorerColumn} flex min-h-0 min-w-0 flex-col ${activePanel ? "max-[897px]:hidden" : "max-[769px]:hidden"}`}
        aria-label="Explorateur du projet"
      >
        <div className="min-h-0 flex-1">
          <ViewerExplorerSplit
            explorer={
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
            }
            inspector={
              <IfcPropertiesPane
                activeModelId={activeModelId}
                modelName={activeIfcSource?.fileName ?? null}
                onClearSelection={() =>
                  controllerRef.current?.selectEntity(null)
                }
                onFrameSelection={() => controllerRef.current?.frameSelection()}
                snapshot={snapshot}
              />
            }
          />
        </div>
      </aside>

      <section
        className="relative min-h-0 min-w-0 overflow-hidden bg-[var(--background-alt-grey)]"
        aria-label="Visionneuse 3D du projet"
      >
        <canvas
          aria-label={`Vue 3D du projet ${projectName}`}
          className={`${styles.canvas} ${snapshot.section.pickMode ? styles.pickingCanvas : ""}`}
          ref={canvasRef}
        />

        <div className={styles.rightControls}>
          {snapshot.meshCount > 0 ||
          snapshot.pointClouds.some((cloud) => cloud.pointCount > 0) ? (
            <ViewCube
              getViewer={getViewer}
              phase={snapshot.phase}
              projectId={projectId}
            />
          ) : null}
        </div>
        <ViewerToolBar
          activeGroupId={activeToolGroup}
          bcfTopicCount={bcfTopicCount}
          onFitToView={() => getViewer()?.fitToView()}
          onSelect={openPanel}
          rootRef={toolBarRef}
        />

        {activePanel === "cut-plane" && snapshot.section.active === "plane" ? (
          <SectionPlaneGizmo
            getViewer={getViewer}
            plane={snapshot.section.plane}
          />
        ) : null}
        {activePanel === "cut-box" &&
        snapshot.section.active === "box" &&
        snapshot.section.box ? (
          <SectionBoxGizmo box={snapshot.section.box} getViewer={getViewer} />
        ) : null}
        {activePanel === "cut-plane" &&
        (snapshot.section.pickMode ||
          (snapshot.section.active === "plane" && snapshot.section.trace)) ? (
          <SectionSketchOverlay
            canvasRef={canvasRef}
            getViewer={getViewer}
            section={snapshot.section}
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

        <ViewerActiveModifiers
          activePanel={activePanel}
          modifiers={activeModifiers}
          onOpen={(modifier, trigger) =>
            openPanel(modifier.panel, modifier.group, trigger)
          }
        />

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

      <ViewerSidePanel
        focusRequest={panelFocusRequest}
        iconClass={activePanelConfig?.icon}
        isOpen={activePanel !== null}
        mode={activePanel ?? undefined}
        onClose={() => {
          setActivePanel(null);
          setActiveToolGroup(null);
          setPanelFocusRequest(0);
          const returnTarget =
            (lastPanelTrigger.current?.isConnected
              ? lastPanelTrigger.current
              : null) ?? toolBarRef.current?.querySelector("button");
          returnTarget?.focus();
        }}
        title={activePanelConfig?.title ?? "Panneau d’outils"}
      >
        {activeIfcSource ? (
          <IfcAssistantPanel
            assetId={activeIfcSource.assetId}
            configured={assistantConfigured}
            getViewer={getViewer}
            hidden={activePanel !== "assistant"}
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
        {activePanel === "assistant" ? (
          activeIfcSource ? null : (
            <p className={styles.panelState}>
              Ajoutez une maquette IFC pour utiliser l’assistant.
            </p>
          )
        ) : activePanel === "bcf" ? (
          <BcfTopicsPanel
            assetId={activeModelId ?? ""}
            permissions={bcfPermissions}
            canCaptureViewpoint={
              snapshot.phase === "ready" && Boolean(activeModelId)
            }
            initialTopics={initialBcfTopics}
            onApplyViewpoint={(data, targetDistance) => {
              controllerRef.current?.applyBcfViewpoint(data, targetDistance);
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
            }}
            onTopicCountChange={setBcfTopicCount}
            projectId={projectId}
            selection={snapshot.selection}
            availableIfcAssetIds={ifcSources.map((source) => source.assetId)}
          />
        ) : activePanel === "cut-plane" || activePanel === "cut-box" ? (
          <SectionPanel
            getViewer={getViewer}
            hasIfcGeometry={snapshot.meshCount > 0}
            hasPointCloud={snapshot.pointClouds.some(
              (cloud) => cloud.pointCount > 0,
            )}
            mode={activePanel === "cut-box" ? "box" : "plane"}
            onModeChange={(mode) => {
              controllerRef.current?.cancelSectionPick();
              setActivePanel(mode === "box" ? "cut-box" : "cut-plane");
            }}
            section={snapshot.section}
          />
        ) : upcomingDescription ? (
          <div className={styles.upcoming}>
            <Alert
              description={upcomingDescription}
              role="status"
              severity="info"
              title="Outil en préparation"
            />
          </div>
        ) : null}
      </ViewerSidePanel>
    </main>
  );
}
