"use client";

import type { CSSProperties } from "react";

import { useViewerPanels } from "../model/use-viewer-panels";
import { useBcfViewer } from "@/features/manage-bcf-topics";
import { ViewerLoadStatus } from "./viewer-load-status";
import type { SavedFloorPlan } from "@mnemo/contracts/floor-plans";
import type { BcfTopicSummary } from "@mnemo/contracts/bcf";
import type {
  AssistantThreadHistory,
  AssistantThreadSummary,
} from "@mnemo/contracts/assistant";
import {
  FloorPlanView,
  FloorPlanPanel,
  useFloorPlans,
} from "@/features/view-floor-plans";
import { ViewerPanelContent } from "./viewer-panel-content";
import {
  SectionInstruction,
  SectionBoxGizmo,
  SectionPlaneGizmo,
  SectionSketchOverlay,
} from "@/features/control-section";
import { IfcAssistantPanel } from "@/features/interact-with-ifc-assistant";
import { BcfPanel, BcfMarkers } from "@/features/manage-bcf-topics";
import { useProjectScene } from "../model/use-project-scene";
import { getActiveViewerModifiers } from "../model/viewer-active-modifiers";
import { viewerPanels } from "../model/viewer-tool-catalog";
import type {
  ViewerIfcSource,
  ViewerPointCloudFailure,
  ViewerPointCloudSource,
} from "@/entities/viewer";
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

export function ProjectViewer({
  assistantSessions,
  assistantConfigured,
  assistantMcpConfigured,
  bcfPermissions,
  ifcSources,
  initialBcfTopics,
  initialFloorPlans,
  canManageFloorPlans,
  pointCloudFailures,
  pointCloudSources,
  projectId,
  projectName,
}: {
  assistantSessions: Record<string, AssistantSession>;
  assistantConfigured: boolean;
  assistantMcpConfigured: boolean;
  bcfPermissions: {
    read: boolean;
    createTopic: boolean;
    updateTopic: boolean;
    createComment: boolean;
    createViewpoint: boolean;
  };
  ifcSources: ViewerIfcSource[];
  initialBcfTopics: BcfTopicSummary[];
  initialFloorPlans: SavedFloorPlan[];
  canManageFloorPlans: boolean;
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
  const floorPlans = useFloorPlans(getViewer, projectId, initialFloorPlans);

  const {
    activePanel,
    setActivePanel,
    explorerPinned,
    setExplorerPinned,
    activeToolGroup,
    setActiveToolGroup,
    panelFocusRequest,
    setPanelFocusRequest,
    toolBarRef,
    openPanel,
    closePanel,
  } = useViewerPanels(getViewer);
  const {
    bcfTopicCount,
    setBcfTopicCount,
    markerTopics,
    setMarkerTopics,
    activeBcfTopicId,
    setActiveBcfTopicId,
    captureBcf,
    previewBcfObjects,
    queryBcfObjects,
    bcfPanelRef,
  } = useBcfViewer(getViewer, activePanel === "bcf", initialBcfTopics);

  const activeModelId = snapshot.activeModelId;
  const activeIfcSource = ifcSources.find(
    (source) => source.assetId === activeModelId,
  );
  const activePanelConfig = activePanel ? viewerPanels[activePanel] : null;
  const activeModifiers = getActiveViewerModifiers(snapshot);

  const failedSource = ifcSources.find(
    (source) =>
      source.assetId === failedAssetId ||
      snapshot.models.some(
        (model) => model.assetId === source.assetId && model.phase === "error",
      ),
  );

  const showExplorer = activePanel === "layers" || explorerPinned;
  const hasToolPanel = activePanel !== null && activePanel !== "layers";

  return (
    <main
      className={`${styles.shell} relative h-full w-full min-h-0 min-w-0 overflow-hidden`}
      style={
        {
          "--viewer-panel-width":
            activePanel === "bcf" ||
            activePanel === "floor-plan" ||
            activePanel === "assistant"
              ? "24rem"
              : "20rem",
        } as CSSProperties
      }
      data-explorer-pinned={(explorerPinned && hasToolPanel) || undefined}
      data-panel-open={Boolean(activePanel) || showExplorer}
    >
      <ViewerSidePanel
        title="Maquettes et relevés"
        iconClass="fr-icon-stack-line"
        isOpen={showExplorer}
        focusRequest={activePanel === "layers" ? panelFocusRequest : 0}
        mode="layers"
        pinned={explorerPinned && hasToolPanel}
        onPin={() => setExplorerPinned(!explorerPinned)}
        onClose={() => {
          setExplorerPinned(false);
          if (activePanel === "layers") closePanel();
        }}
      >
        <div className="h-full min-h-0">
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
              snapshot.selection ? (
                <IfcPropertiesPane
                  activeModelId={activeModelId}
                  modelName={activeIfcSource?.fileName ?? null}
                  onClearSelection={() =>
                    controllerRef.current?.selectEntity(null)
                  }
                  onFrameSelection={() =>
                    controllerRef.current?.frameSelection()
                  }
                  snapshot={snapshot}
                />
              ) : null
            }
          />
        </div>
      </ViewerSidePanel>

      <section
        className={`${styles.stage} absolute inset-y-0 right-0 min-h-0 min-w-0 overflow-hidden bg-[var(--background-alt-grey)]`}
        aria-label="Visionneuse 3D du projet"
      >
        <canvas
          aria-label={`Vue 3D du projet ${projectName}`}
          className={`${styles.canvas} ${snapshot.section.pickMode ? styles.pickingCanvas : ""}`}
          ref={canvasRef}
        />

        {floorPlans.plan ? (
          <FloorPlanView
            key={floorPlans.plan.id}
            title={floorPlans.plan.title}
            exportTitle={
              floorPlans.saved.selected?.name || floorPlans.plan.title
            }
            exportContext={{
              projectName,
              sourceName:
                ifcSources.find(
                  (source) => source.assetId === floorPlans.plan?.assetId,
                )?.fileName ?? "Maquette IFC",
              storeyName: floorPlans.plan.title,
              storeyElevation:
                snapshot.models
                  .find((model) => model.assetId === floorPlans.plan?.assetId)
                  ?.catalog?.storeys.find(
                    (storey) => storey.expressId === floorPlans.plan?.storeyId,
                  )?.elevation ?? null,
            }}
            drawing={floorPlans.plan.drawing}
            preset={floorPlans.preset}
            rules={floorPlans.rules}
            selectedIds={snapshot.selectedElements
              .filter((element) => element.assetId === floorPlans.plan?.assetId)
              .map((element) => element.expressId)}
            onSelect={(expressId) => {
              if (expressId === null) controllerRef.current?.selectEntity(null);
              else if (floorPlans.plan)
                controllerRef.current?.selectModelEntity(
                  floorPlans.plan.assetId,
                  expressId,
                );
            }}
            onClose={floorPlans.close}
          />
        ) : null}

        <BcfMarkers
          topics={snapshot.phase === "ready" ? markerTopics : []}
          getViewer={getViewer}
          activeId={activeBcfTopicId}
          onSelect={(id) => {
            void bcfPanelRef.current?.open(id);
            setActivePanel("bcf");
            setActiveToolGroup("annotations");
            setPanelFocusRequest((request) => request + 1);
          }}
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

        <SectionInstruction
          section={snapshot.section}
          onCancel={() => getViewer()?.cancelSectionPick()}
        />

        <ViewerLoadStatus
          snapshot={snapshot}
          accessError={accessError}
          pointCloudFailures={pointCloudFailures}
          failedSource={failedSource}
          retrying={retrying}
          onRetry={retry}
        />

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

        <div className={styles.help}>
          <span>Clic : sélectionner</span>
          <span>Glisser : orbiter</span>
          <span>Maj ou clic milieu : déplacer</span>
          <span>Molette : zoomer</span>
        </div>
      </section>

      <ViewerToolBar
        activeGroupId={activeToolGroup}
        layerCount={ifcSources.length + pointCloudSources.length}
        sectionActive={snapshot.section.active !== null}
        bcfTopicCount={bcfTopicCount}
        canReadBcf={bcfPermissions.read}
        onFitToView={() => getViewer()?.fitToView()}
        onSelect={openPanel}
        rootRef={toolBarRef}
      />
      <ViewerSidePanel
        focusRequest={panelFocusRequest}
        iconClass={activePanelConfig?.icon}
        isOpen={hasToolPanel}
        mode={activePanel ?? undefined}
        onClose={closePanel}
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
        {bcfPermissions.read ? (
          <div className="h-full min-h-0" hidden={activePanel !== "bcf"}>
            <BcfPanel
              projectId={projectId}
              initialTopics={initialBcfTopics}
              permissions={bcfPermissions}
              selection={
                snapshot.selection?.globalId && activeModelId
                  ? {
                      assetId: activeModelId,
                      expressId: snapshot.selection.expressId,
                      globalId: snapshot.selection.globalId,
                      name:
                        snapshot.selection.name || snapshot.selection.globalId,
                    }
                  : null
              }
              queryObjects={queryBcfObjects}
              previewObjects={previewBcfObjects}
              capture={captureBcf}
              canCapture={snapshot.phase === "ready" && Boolean(activeModelId)}
              applyViewpoint={(view) =>
                controllerRef.current?.applyBcfViewpoint(
                  view.data,
                  view.targetDistance,
                ) ?? []
              }
              focusObject={(component) =>
                controllerRef.current?.focusBcfComponent(component) ?? false
              }
              onTopicsChange={setBcfTopicCount}
              onActiveTopicChange={setActiveBcfTopicId}
              onMarkersChange={setMarkerTopics}
              ref={bcfPanelRef}
            />
          </div>
        ) : null}
        <ViewerPanelContent
          panel={activePanel}
          snapshot={snapshot}
          getViewer={getViewer}
          hasActiveIfc={Boolean(activeIfcSource)}
          onSectionModeChange={(mode) => {
            controllerRef.current?.cancelSectionPick();
            setActivePanel(mode === "box" ? "cut-box" : "cut-plane");
          }}
          floorPlans={
            <FloorPlanPanel
              models={snapshot.models}
              controller={floorPlans}
              canManage={canManageFloorPlans}
            />
          }
        />
      </ViewerSidePanel>
    </main>
  );
}
