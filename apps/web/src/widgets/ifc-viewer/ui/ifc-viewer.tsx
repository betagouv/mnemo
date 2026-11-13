"use client";

import { MeasurementEditor } from "@/features/manage-measurements";
import { ProjectMeasurementsProvider } from "@/entities/measurement";
import type { SavedMeasurement } from "@mnemo/contracts/measurements";
import {
  SceneMeasurementProvider,
  MeasurementPanel,
  MeasurementOverlay,
} from "@/features/measure-scene";
import { useRef, useState, type CSSProperties } from "react";

import { useViewerFeedback } from "../model/use-viewer-feedback";
import {
  BimFilterPanel,
  type BimFilterControls,
} from "@/features/filter-bim-model";
import type { SavedBimFilters } from "@mnemo/contracts/bim-filters";
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
import { ProjectLayers } from "./project-layers";
import { ViewCube } from "./view-cube";
import { ViewerActiveModifiers } from "./viewer-active-modifiers";
import { ViewerActionMessage } from "./viewer-action-message";
import { ViewerSelection } from "./viewer-selection";
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
  initialBimFilters,
  initialMeasurements,
  canManageFloorPlans,
  canManageBimFilters,
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
  initialBimFilters: SavedBimFilters[];
  initialMeasurements: SavedMeasurement[];
  canManageFloorPlans: boolean;
  canManageBimFilters: boolean;
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
  const [activeFilterGroupCount, setActiveFilterGroupCount] = useState(0);
  const bimFilterControls = useRef<BimFilterControls>(null);

  const {
    activePanel,
    setActivePanel,
    explorerPinned,
    setExplorerPinned,
    activeToolGroup,
    panelFocusRequest,
    toolBarRef,
    openPanel,
    togglePanel,
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
    createBcfFromSelection,
  } = useBcfViewer(getViewer, activePanel === "bcf", initialBcfTopics);

  const measurementMode =
    activePanel === "distance" || activePanel === "surface"
      ? activePanel
      : null;
  const measurementsEnabled = snapshot.phase === "ready" && !floorPlans.plan;

  const activeModelId = snapshot.activeModelId;
  const activeIfcSource = ifcSources.find(
    (source) => source.assetId === activeModelId,
  );
  const activePanelConfig = activePanel ? viewerPanels[activePanel] : null;
  const visibilityChanged =
    hiddenPointCloudIds.size > 0 ||
    snapshot.models.some(
      (model) =>
        getViewer()?.getLayerVisibility(model.assetId, { kind: "model" }) !==
          "show" ||
        (getViewer()?.getLayerExceptionCount(model.assetId, {
          kind: "model",
        }) ?? 0) > 0,
    );
  const activeModifiers = getActiveViewerModifiers(snapshot, visibilityChanged);
  const {
    feedback,
    dismiss: dismissFeedback,
    reset: resetModifier,
  } = useViewerFeedback(
    getViewer,
    hiddenPointCloudIds,
    setPointCloudVisible,
    () => bimFilterControls.current?.resetVisuals() ?? null,
  );

  const failedSource = ifcSources.find(
    (source) =>
      source.assetId === failedAssetId ||
      snapshot.models.some(
        (model) => model.assetId === source.assetId && model.phase === "error",
      ),
  );

  const [revealSelectionRequest, setRevealSelectionRequest] = useState(0);
  const showExplorer = activePanel === "layers" || explorerPinned;
  const hasToolPanel = activePanel !== null && activePanel !== "layers";

  const content = (
    <main
      className={`${styles.shell} relative h-full w-full min-h-0 min-w-0 overflow-hidden`}
      style={
        {
          "--viewer-panel-width":
            activePanelConfig?.width ?? viewerPanels.layers.width,
          "--viewer-explorer-width": viewerPanels.layers.width,
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
        pinned={explorerPinned}
        docked={explorerPinned && hasToolPanel}
        onPin={() => setExplorerPinned(!explorerPinned)}
        onClose={() => {
          setExplorerPinned(false);
          if (activePanel === "layers") closePanel();
        }}
      >
        <div className="h-full min-h-0">
          <ProjectLayers
            revealSelectionRequest={revealSelectionRequest}
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
        </div>
      </ViewerSidePanel>

      <section
        className={`${styles.stage} absolute inset-y-0 right-0 min-h-0 min-w-0 overflow-hidden bg-[var(--background-alt-grey)]`}
        aria-label="Visionneuse 3D du projet"
      >
        <canvas
          aria-label={`Vue 3D du projet ${projectName}`}
          data-phase={snapshot.phase}
          className={`${styles.canvas} ${snapshot.section.pickMode ? styles.pickingCanvas : ""}`}
          ref={canvasRef}
          tabIndex={0}
        />

        {measurementsEnabled ? <MeasurementOverlay /> : null}

        {floorPlans.plan ? (
          <FloorPlanView
            Editor={MeasurementEditor}
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
              verticalDatum: snapshot.models.find(
                (model) => model.assetId === floorPlans.plan?.assetId,
              )?.georeferencing?.verticalDatum,
              storeyElevation:
                snapshot.models
                  .find((model) => model.assetId === floorPlans.plan?.assetId)
                  ?.catalog?.storeys.find(
                    (storey) => storey.expressId === floorPlans.plan?.storeyId,
                  )?.elevation ?? null,
            }}
            drawing={floorPlans.plan.drawing}
            savedPlanId={
              floorPlans.saved.selected?.assetId === floorPlans.plan.assetId &&
              floorPlans.saved.selected.storeyId === floorPlans.plan.storeyId
                ? floorPlans.saved.selected.id
                : null
            }
            getViewer={getViewer}
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
            openPanel("bcf", "annotations");
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

        <ViewerSelection
          key={`${activeModelId}:${snapshot.selection?.expressId}`}
          snapshot={snapshot}
          getViewer={getViewer}
          modelName={activeIfcSource?.fileName ?? null}
          canCreateBcf={bcfPermissions.read && bcfPermissions.createTopic}
          onCreateBcf={(trigger) => {
            createBcfFromSelection();
            openPanel("bcf", "annotations", trigger);
          }}
          onReveal={(trigger) => {
            openPanel("layers", "layers", trigger);
            setRevealSelectionRequest((request) => request + 1);
          }}
        />

        <ViewerActiveModifiers
          activePanel={activePanel}
          onReset={resetModifier}
          modifiers={activeModifiers}
          onOpen={(modifier, trigger) =>
            openPanel(modifier.panel, modifier.group, trigger)
          }
        />

        <ViewerActionMessage feedback={feedback} onDismiss={dismissFeedback} />
      </section>

      <ViewerToolBar
        activeGroupId={activeToolGroup}
        activeFilterGroupCount={activeFilterGroupCount}
        layerCount={ifcSources.length + pointCloudSources.length}
        sectionActive={snapshot.section.active !== null}
        bcfTopicCount={bcfTopicCount}
        canReadBcf={bcfPermissions.read}
        onSelect={togglePanel}
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
        <div className="h-full min-h-0" hidden={activePanel !== "filters"}>
          <BimFilterPanel
            ref={bimFilterControls}
            snapshot={snapshot}
            getViewer={getViewer}
            projectId={projectId}
            initial={initialBimFilters}
            canSave={canManageBimFilters}
            onActiveGroupCountChange={setActiveFilterGroupCount}
          />
        </div>
        <ViewerPanelContent
          panel={activePanel}
          snapshot={snapshot}
          getViewer={getViewer}
          hasActiveIfc={Boolean(activeIfcSource)}
          onSectionModeChange={(mode) => {
            const viewer = getViewer();
            viewer?.cancelSectionPick();
            if (snapshot.section.active) {
              if (mode === "box") viewer?.showSectionBox();
              else viewer?.showSectionPlane();
            }
            setActivePanel(mode === "box" ? "cut-box" : "cut-plane");
          }}
          measurements={<MeasurementPanel />}
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

  return (
    <ProjectMeasurementsProvider
      projectId={projectId}
      initial={initialMeasurements}
      canManage={canManageFloorPlans}
    >
      <SceneMeasurementProvider
        Editor={MeasurementEditor}
        onModeChange={setActivePanel}
        getViewer={getViewer}
        canvasRef={canvasRef}
        mode={measurementMode}
        enabled={measurementsEnabled}
      >
        {content}
      </SceneMeasurementProvider>
    </ProjectMeasurementsProvider>
  );
}
