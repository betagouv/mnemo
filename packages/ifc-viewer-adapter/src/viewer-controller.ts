import {
  measurementToProject,
  measurementFromProject,
} from "./measurement-coordinates";
import { MeasurementPicking } from "./measurement-picking";
import {
  captureSceneBcfViewpoint,
  applySceneBcfViewpoint,
  computeSceneBcfMarkers,
} from "./bcf-viewpoints";
import { FloorPlanGenerator } from "./floor-plan-generator";
import {
  FederationRegistry,
  type Renderer,
  type SectionPlaneAxis,
} from "@ifc-lite/renderer";
import type {
  BcfViewpointPayload,
  BcfComponent,
  BcfMarkerTopic,
  CreateBcfTopicInput,
} from "@mnemo/contracts/bcf";
import type { PointCloudTransform } from "@mnemo/point-cloud-viewer-adapter";
import type { IfcBimQuery, IfcElementSummary } from "./bim-index";
import { BimLayerVisibility } from "./bim-layer-visibility";
import { IfcModelLoader, type LoadedIfcModel } from "./ifc-model-loader";
import { PointCloudLayers } from "./point-cloud-layers";
import { switchProjectionAtVisibleSurface } from "./projection-switch";
import { SceneInteractions } from "./scene-interactions";
import { SectionController } from "./section-controller";
import { createDefaultRuntime } from "./viewer-runtime";
import { createEmptyViewerSnapshot } from "./viewer-snapshot";
import type {
  BimLayerTarget,
  CapturedBcfViewpoint,
  IfcModelSnapshot,
  IfcViewerRuntime,
  IfcViewerSnapshot,
  IfcVisualPlan,
  IfcVisualSnapshot,
  LayerVisibility,
  LoadIfcInput,
  LoadPointCloudInput,
  PointCloudSnapshot,
} from "./viewer-types";

const maxCanvasDimension = 8_192;

export type ViewerPresetView = Parameters<
  ReturnType<Renderer["getCamera"]>["setPresetView"]
>[0];

export type ViewerCameraRotation = ReturnType<
  ReturnType<Renderer["getCamera"]>["getRotation"]
>;

export type ViewerProjectionMode = ReturnType<
  ReturnType<Renderer["getCamera"]>["getProjectionMode"]
>;

export type {
  BimLayerTarget,
  CapturedBcfViewpoint,
  IfcElementDetails,
  IfcModelSnapshot,
  IfcProcessingEngine,
  IfcProcessingSnapshot,
  IfcSectionSnapshot,
  IfcPropertyValue,
  IfcValueItem,
  IfcValueSet,
  IfcViewerPhase,
  IfcViewerRuntime,
  IfcViewerSnapshot,
  IfcVisualColorGroup,
  IfcVisualMode,
  IfcVisualPlan,
  IfcVisualSnapshot,
  LayerVisibility,
  LoadIfcInput,
  LoadPointCloudInput,
  PointCloudOptionsSnapshot,
  PointCloudPhase,
  PointCloudSnapshot,
} from "./viewer-types";

function alignCanvasWidth(width: number) {
  return Math.min(
    maxCanvasDimension,
    Math.max(64, Math.floor(Math.max(1, width) / 64) * 64),
  );
}

function clampCanvasHeight(height: number) {
  return Math.min(maxCanvasDimension, Math.max(1, Math.floor(height)));
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Le chargement de la maquette a échoué.";
}

export class IfcViewerController {
  private readonly renderer: Renderer;
  private readonly measurementPicking: MeasurementPicking;
  private measurementPickHandler: ((x: number, y: number) => void) | null =
    null;
  private readonly floorPlans = new FloorPlanGenerator();
  private readonly modelLoader: IfcModelLoader;
  private readonly listeners = new Set<(snapshot: IfcViewerSnapshot) => void>();
  private readonly cameraRotationListeners = new Set<
    (rotation: ViewerCameraRotation) => void
  >();
  private lastCameraRotation: ViewerCameraRotation | null = null;
  private readonly projectionModeListeners = new Set<
    (mode: ViewerProjectionMode) => void
  >();
  private lastProjectionMode: ViewerProjectionMode | null = null;
  private readonly runtime: IfcViewerRuntime;
  private readonly federation = new FederationRegistry();
  private readonly models = new Map<string, LoadedIfcModel>();
  private snapshot: IfcViewerSnapshot = createEmptyViewerSnapshot();
  private initialization: Promise<void> | null = null;
  private resizeObserver: Pick<
    ResizeObserver,
    "observe" | "disconnect"
  > | null = null;
  private frameHandle: number | null = null;
  private lastFrameTime: number | null = null;
  private unsubscribeDeviceLoss: (() => void) | null = null;
  private disposed = false;
  private readonly interactions: SceneInteractions;
  private readonly sections: SectionController;
  private selectionGeneration = 0;
  private hiddenIds = new Set<number>();
  private readonly layerVisibility: BimLayerVisibility;
  private isolatedIds: Set<number> | null = null;
  private ghostExceptIds: Set<number> | null = null;
  private colorOverrides = new Map<number, [number, number, number, number]>();
  private readonly pointCloudLayers: PointCloudLayers;
  private projectionSwitchGeneration = 0;
  private backgroundColor: [number, number, number, number] = [
    0.97, 0.97, 0.985, 1,
  ];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    runtime: IfcViewerRuntime = createDefaultRuntime(),
  ) {
    this.runtime = runtime;
    this.renderer = runtime.createRenderer(canvas);
    this.measurementPicking = new MeasurementPicking(this.renderer);
    this.modelLoader = new IfcModelLoader({
      renderer: this.renderer,
      federation: this.federation,
      models: this.models,
      runtime,
      initialize: () => this.init(),
      isDisposed: () => this.disposed,
      getSnapshot: () => this.snapshot,
      updateSnapshot: (update) => this.updateSnapshot(update),
      updateModelSnapshot: (assetId, update) =>
        this.updateModelSnapshot(assetId, update),
      onModelReady: () => this.layerVisibility.rebuild(),
    });
    this.layerVisibility = new BimLayerVisibility(this.models, this.federation);
    this.pointCloudLayers = new PointCloudLayers({
      renderer: this.renderer,
      canvas,
      runtime,
      initialize: () => this.init(),
      isDisposed: () => this.disposed,
      onSnapshot: (assetId, update) =>
        this.updatePointCloudSnapshot(assetId, update),
      onRemove: (assetId) =>
        this.updateSnapshot({
          pointClouds: this.snapshot.pointClouds.filter(
            (pointCloud) => pointCloud.assetId !== assetId,
          ),
        }),
    });
    this.sections = new SectionController(
      this.renderer,
      (section) => this.updateSnapshot({ section }),
      () => ({
        hiddenIds: new Set([
          ...this.hiddenIds,
          ...this.layerVisibility.hiddenIds,
        ]),
        isolatedIds: this.isolatedIds,
      }),
    );
    this.interactions = new SceneInteractions({
      canvas,
      renderer: this.renderer,
      onPick: (x, y, additive) => this.pickEntity(x, y, additive),
      getCursor: () => (this.measurementPickHandler ? "crosshair" : "grab"),
    });
  }

  subscribe(listener: (snapshot: IfcViewerSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeCameraRotation(listener: (rotation: ViewerCameraRotation) => void) {
    if (this.disposed) return () => undefined;
    this.cameraRotationListeners.add(listener);
    const rotation = this.renderer.getCamera().getRotation();
    this.lastCameraRotation = rotation;
    listener(rotation);

    return () => {
      this.cameraRotationListeners.delete(listener);
    };
  }

  subscribeProjectionMode(listener: (mode: ViewerProjectionMode) => void) {
    if (this.disposed) return () => undefined;
    this.projectionModeListeners.add(listener);
    const mode = this.renderer.getCamera().getProjectionMode();
    this.lastProjectionMode = mode;
    listener(mode);

    return () => {
      this.projectionModeListeners.delete(listener);
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  getSectionBounds() {
    return this.sections.bounds;
  }

  setSectionAxis(axis: SectionPlaneAxis) {
    this.sections.setAxis(axis);
  }

  setSectionPosition(position: number) {
    this.sections.setPosition(position);
  }

  setSectionCustomDistance(distance: number) {
    this.sections.setCustomDistance(distance);
  }

  onMeasurementPick(handler: (x: number, y: number) => void) {
    this.measurementPicking.reset();
    this.measurementPickHandler = handler;
    this.canvas.style.cursor = "crosshair";
    return () => {
      if (this.measurementPickHandler === handler) {
        this.measurementPickHandler = null;
        this.canvas.style.cursor = "grab";
        this.measurementPicking.reset();
      }
    };
  }

  pickMeasurementPoint(x: number, y: number, magnetic: boolean) {
    if (this.disposed || this.snapshot.phase !== "ready") return null;
    return this.measurementPicking.pick(x, y, magnetic, {
      hiddenIds: new Set([
        ...this.hiddenIds,
        ...this.layerVisibility.hiddenIds,
      ]),
      isolatedIds: this.isolatedIds,
    });
  }

  measurementToProject(point: { x: number; y: number; z: number }) {
    return measurementToProject(point, this.modelLoader.renderOrigin);
  }

  measurementFromProject(point: { x: number; y: number; z: number }) {
    return measurementFromProject(point, this.modelLoader.renderOrigin);
  }

  getMeasurementRay(x: number, y: number) {
    const bounds = this.canvas.getBoundingClientRect();
    if (this.disposed || bounds.width <= 0 || bounds.height <= 0) return null;
    return this.renderer
      .getCamera()
      .unprojectToRay(x, y, bounds.width, bounds.height);
  }

  projectWorldPoint(point: { x: number; y: number; z: number }) {
    return this.projectWorldPoints([point])[0] ?? null;
  }

  projectWorldPoints(points: readonly { x: number; y: number; z: number }[]) {
    const bounds = this.canvas.getBoundingClientRect();
    if (
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      this.canvas.width <= 0 ||
      this.canvas.height <= 0
    ) {
      return points.map(() => null);
    }
    const camera = this.renderer.getCamera();
    return points.map((point) => {
      const projected = camera.projectToScreen(
        point,
        this.canvas.width,
        this.canvas.height,
      );
      return projected
        ? {
            x: projected.x * (bounds.width / this.canvas.width),
            y: projected.y * (bounds.height / this.canvas.height),
          }
        : null;
    });
  }

  setSectionFlipped(flipped: boolean) {
    this.sections.setFlipped(flipped);
  }

  showSectionPlane() {
    this.sections.showPlane();
  }

  showSectionBox() {
    return this.sections.showBox();
  }

  fitSectionBox() {
    return this.sections.fitBox();
  }

  moveSectionBoxFace(axis: 0 | 1 | 2, side: "min" | "max", value: number) {
    this.sections.moveBoxFace(axis, side, value);
  }

  startSectionPick(mode: "face" | "two-point") {
    this.sections.startPick(mode);
  }

  cancelSectionPick() {
    this.sections.cancelPick();
  }

  hideSection() {
    this.sections.hide();
  }

  resetSection() {
    this.sections.reset();
  }

  getStore() {
    const activeId = this.snapshot.activeModelId;
    return activeId ? (this.models.get(activeId)?.store ?? null) : null;
  }

  queryBim(query: IfcBimQuery): IfcElementSummary[] {
    const activeId = this.snapshot.activeModelId;
    return activeId
      ? (this.models.get(activeId)?.bimIndex.query(query) ?? [])
      : [];
  }

  findBimIds(query: IfcBimQuery): number[] {
    const activeId = this.snapshot.activeModelId;
    if (!activeId) return [];
    return (this.models.get(activeId)?.bimIndex.findIds(query) ?? []).map(
      (id) => this.federation.toGlobalId(activeId, id),
    );
  }

  setActiveModel(assetId: string) {
    const model = this.models.get(assetId);
    if (!model || this.snapshot.activeModelId === assetId) return;
    this.resetVisuals();
    this.selectEntity(null);
    this.updateSnapshot({
      activeModelId: assetId,
      catalog: model.bimIndex.catalog,
      processing: model.processing,
    });
  }

  getBimElements(
    assetId: string,
    storeyId: number | null,
    offset = 0,
    limit = 100,
    ifcClass?: string,
  ): IfcElementSummary[] {
    const model = this.models.get(assetId);
    if (!model) return [];
    return model.bimIndex.queryPage(storeyId, offset, limit, ifcClass);
  }

  getBimElement(assetId: string, expressId: number) {
    return this.models.get(assetId)?.bimIndex.getElement(expressId) ?? null;
  }

  getBimClasses(assetId: string, storeyId: number | null) {
    return this.models.get(assetId)?.bimIndex.classesForStorey(storeyId) ?? [];
  }

  getLayerVisibility(assetId: string, target: BimLayerTarget): LayerVisibility {
    return this.layerVisibility.get(assetId, target);
  }

  getLayerExceptionCount(assetId: string, target: BimLayerTarget): number {
    return this.layerVisibility.exceptionCount(assetId, target);
  }

  setLayerVisibility(
    assetId: string,
    target: BimLayerTarget,
    mode: LayerVisibility,
  ) {
    if (!this.layerVisibility.set(assetId, target, mode)) return;
    this.updateModelSnapshot(assetId, {});
    this.renderer.requestRender();
  }

  resetLayerVisibility() {
    if (this.disposed) return;
    this.layerVisibility.reset();
    this.updateSnapshot({});
    this.renderer.requestRender();
  }

  init() {
    if (this.disposed) {
      return Promise.reject(new Error("The IFC viewer has been disposed"));
    }

    this.initialization ??= this.initialize();
    return this.initialization;
  }

  loadIfc(input: LoadIfcInput) {
    this.floorPlans.clear();
    return this.modelLoader.load(input);
  }

  loadPointCloud(input: LoadPointCloudInput) {
    return this.pointCloudLayers.load(input);
  }

  removePointCloud(assetId: string) {
    this.pointCloudLayers.remove(assetId);
  }

  setPointCloudPointSize(pointSize: number) {
    const normalized = Math.min(12, Math.max(1, pointSize));
    this.renderer.setPointCloudOptions({ pointSize: normalized });
    this.updateSnapshot({ pointCloudOptions: { pointSize: normalized } });
    this.renderer.requestRender();
  }

  setBackgroundColor(color: [number, number, number, number]) {
    this.backgroundColor = color;
    this.renderer.requestRender();
  }

  setPointCloudPointBudget(pointBudget: number) {
    this.pointCloudLayers.setBudget(pointBudget);
  }

  setPointCloudTransform(assetId: string, transform: PointCloudTransform) {
    this.pointCloudLayers.setTransform(assetId, transform);
  }
  captureBcfViewpoint(
    components?: CreateBcfTopicInput["components"],
  ): Promise<CapturedBcfViewpoint> {
    return captureSceneBcfViewpoint(this.bcfContext(), components);
  }

  applyBcfViewpoint(data: BcfViewpointPayload, targetDistance: number) {
    return applySceneBcfViewpoint(this.bcfContext(), data, targetDistance);
  }

  fitToView() {
    if (
      !this.disposed &&
      (this.snapshot.meshCount > 0 ||
        this.snapshot.pointClouds.some((cloud) => cloud.pointCount > 0))
    ) {
      this.renderer.fitToView();
      this.renderer.requestRender();
    }
  }

  setPresetView(view: ViewerPresetView) {
    if (this.disposed) return;

    const camera = this.renderer.getCamera();
    const bounds =
      camera.getSceneBounds() ?? this.renderer.getScene().getBounds();
    if (!bounds) return;

    camera.setPresetView(view, bounds);
    this.renderer.requestRender();
  }

  generateFloorPlan(assetId: string, storeyId: number) {
    return this.floorPlans.generate(
      {
        disposed: this.disposed,
        models: this.models,
        renderer: this.renderer,
        modelLoader: this.modelLoader,
        federation: this.federation,
      },
      assetId,
      storeyId,
    );
  }

  cancelFloorPlan() {
    this.floorPlans.cancel();
  }

  orbitFromViewCube(deltaX: number, deltaY: number) {
    if (this.disposed) return;
    this.renderer.getCamera().orbit(deltaX, deltaY, false);
    this.renderer.requestRender();
  }

  async setProjectionMode(mode: ViewerProjectionMode) {
    if (this.disposed) return;
    const generation = ++this.projectionSwitchGeneration;
    const changed = await switchProjectionAtVisibleSurface({
      renderer: this.renderer,
      canvas: this.canvas,
      mode,
      hiddenIds: new Set([
        ...this.hiddenIds,
        ...this.layerVisibility.hiddenIds,
      ]),
      isolatedIds: this.isolatedIds,
      isCurrent: () =>
        !this.disposed && generation === this.projectionSwitchGeneration,
    });
    if (!changed) return;
    this.renderer.requestRender();
    this.notifyProjectionMode(this.renderer.getCamera().getProjectionMode());
  }

  frameModel(assetId: string) {
    const model = this.models.get(assetId);
    if (this.disposed || !model) return;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    let found = false;
    for (const id of model.meshIds) {
      const bounds = this.renderer.getScene().getEntityBoundingBox(id);
      if (!bounds) continue;
      found = true;
      for (const axis of ["x", "y", "z"] as const) {
        min[axis] = Math.min(min[axis], bounds.min[axis]);
        max[axis] = Math.max(max[axis], bounds.max[axis]);
      }
    }
    if (!found) return;
    void this.renderer.getCamera().frameBounds(min, max);
    this.renderer.requestRender();
  }

  frameSelection() {
    const expressId = this.snapshot.selection?.expressId;
    const modelId = this.snapshot.activeModelId;
    if (this.disposed || expressId === undefined || !modelId) return;

    const bounds = this.renderer
      .getScene()
      .getEntityBoundingBox(this.federation.toGlobalId(modelId, expressId));
    if (!bounds) return;

    void this.renderer.getCamera().frameBounds(bounds.min, bounds.max);
    this.renderer.requestRender();
  }

  selectEntity(
    expressId: number | null,
    orbitCenter?: { x: number; y: number; z: number },
    additive = false,
  ) {
    if (expressId === null) {
      if (additive) return;
      this.selectedEntityIds.clear();
      this.bcfPreviewIds.clear();
      this.focusEntity(null);
    } else if (this.snapshot.activeModelId) {
      this.selectModelEntity(
        this.snapshot.activeModelId,
        expressId,
        additive,
        orbitCenter,
      );
    }
  }

  selectModelEntity(
    assetId: string,
    expressId: number,
    additive = false,
    orbitCenter?: { x: number; y: number; z: number },
  ) {
    if (!this.models.has(assetId)) return;
    this.bcfPreviewIds.clear();
    const id = this.federation.toGlobalId(assetId, expressId);
    if (!additive) this.selectedEntityIds.clear();
    if (additive && this.selectedEntityIds.has(id))
      this.selectedEntityIds.delete(id);
    else this.selectedEntityIds.add(id);
    const focusId = this.selectedEntityIds.has(id)
      ? id
      : [...this.selectedEntityIds].at(-1);
    const focus =
      focusId === undefined ? null : this.federation.fromGlobalId(focusId);
    if (focus && focus.modelId !== this.snapshot.activeModelId) {
      const model = this.models.get(focus.modelId)!;
      this.updateSnapshot({
        activeModelId: focus.modelId,
        catalog: model.bimIndex.catalog,
        processing: model.processing,
      });
    }
    this.focusEntity(
      focus?.expressId ?? null,
      this.selectedEntityIds.has(id) ? orbitCenter : undefined,
    );
  }

  private selectedElements() {
    return [...this.selectedEntityIds].flatMap((id) => {
      const target = this.federation.fromGlobalId(id);
      return target
        ? [{ assetId: target.modelId, expressId: target.expressId }]
        : [];
    });
  }

  private focusEntity(
    expressId: number | null,
    orbitCenter?: { x: number; y: number; z: number },
  ) {
    const generation = ++this.selectionGeneration;

    if (expressId === null) {
      this.renderer.getCamera().setOrbitCenter(null);
      this.updateSnapshot({
        selection: null,
        selectedElements: [],
        selectionPhase: "idle",
        selectionMessage: null,
      });
      this.renderer.requestRender();
      return;
    }

    const modelId = this.snapshot.activeModelId;
    const store = modelId ? this.models.get(modelId)?.store : null;
    if (!store || !modelId) return;

    this.updateSnapshot({
      selectionPhase: "loading",
      selectionMessage: null,
    });

    try {
      const selection = this.runtime.readElementDetails(store, expressId);
      if (generation !== this.selectionGeneration || this.disposed) return;

      if (!selection) {
        this.selectEntity(null);
        return;
      }

      const bounds = this.renderer
        .getScene()
        .getEntityBoundingBox(this.federation.toGlobalId(modelId, expressId));
      const center =
        orbitCenter ??
        (bounds
          ? {
              x: (bounds.min.x + bounds.max.x) / 2,
              y: (bounds.min.y + bounds.max.y) / 2,
              z: (bounds.min.z + bounds.max.z) / 2,
            }
          : undefined);
      this.renderer.getCamera().setOrbitCenter(center ?? null);
      this.updateSnapshot({
        selection,
        selectedElements: this.selectedElements(),
        selectionPhase: "ready",
        selectionMessage: null,
      });
      this.renderer.requestRender();
    } catch (error) {
      if (generation !== this.selectionGeneration || this.disposed) return;
      this.selectedEntityIds.clear();
      this.updateSnapshot({
        selection: null,
        selectedElements: [],
        selectionPhase: "error",
        selectionMessage: errorMessage(error),
      });
      this.renderer.requestRender();
    }
  }

  isolate(query: IfcBimQuery, label?: string) {
    const ids = this.findBimIds(query);
    const visual = this.snapshot.visual;
    this.applyVisualPlan({
      focusIds: ids,
      showContext: visual.showContext,
      contextOpacity: visual.contextOpacity,
      label: label ?? "Isolation BIM",
    });
  }

  hide(query: IfcBimQuery, label?: string) {
    const ids = this.findBimIds(query);
    this.applyVisualPlan({
      hiddenIds: ids,
      label: label ?? "Éléments masqués",
    });
    this.updateVisualSnapshot({ mode: "hide", matchCount: ids.length });
  }

  color(
    query: IfcBimQuery,
    color: readonly [number, number, number, number],
    label?: string,
  ) {
    const ids = this.findBimIds(query);
    this.applyVisualPlan({
      colors: [{ ids, color }],
      label: label ?? "Coloration BIM",
    });
    this.updateVisualSnapshot({ mode: "color", matchCount: ids.length });
  }

  colorByStorey() {
    const storeys = this.snapshot.catalog?.storeys ?? [];
    const palette = [
      [0.24, 0.62, 0.98, 1],
      [0.93, 0.32, 0.3, 1],
      [0.55, 0.36, 0.96, 1],
      [0.12, 0.72, 0.48, 1],
      [0.96, 0.65, 0.18, 1],
      [0.91, 0.3, 0.66, 1],
    ] as const;
    const groups = storeys.map((storey, index) => ({
      ids: this.findBimIds({ storeyId: storey.expressId }),
      color: palette[index % palette.length],
    }));
    this.applyVisualPlan({ colors: groups, label: "Palette par niveau" });
    this.updateVisualSnapshot({
      mode: "color",
      matchCount: groups.reduce((count, group) => count + group.ids.length, 0),
    });
  }

  setIsolationContext(showContext: boolean, contextOpacity: number) {
    const opacity = Math.min(0.9, Math.max(0.02, contextOpacity));
    const focusIds = this.ghostExceptIds ?? this.isolatedIds;
    this.updateVisualSnapshot({ showContext, contextOpacity: opacity });

    if (this.snapshot.visual.mode === "isolate" && focusIds) {
      this.isolatedIds = showContext ? null : new Set(focusIds);
      this.ghostExceptIds = showContext ? new Set(focusIds) : null;
      this.renderer.requestRender();
    }
  }

  applyVisualPlan(plan: IfcVisualPlan) {
    this.hiddenIds = new Set(plan.hiddenIds ?? []);
    const focusIds = plan.focusIds ? new Set(plan.focusIds) : null;
    const showContext = plan.showContext ?? this.snapshot.visual.showContext;
    const contextOpacity = Math.min(
      0.9,
      Math.max(
        0.02,
        plan.contextOpacity ?? this.snapshot.visual.contextOpacity,
      ),
    );
    this.isolatedIds = focusIds && !showContext ? focusIds : null;
    this.ghostExceptIds = focusIds && showContext ? focusIds : null;
    this.colorOverrides = new Map();

    for (const group of plan.colors ?? []) {
      const color = [...group.color] as [number, number, number, number];
      for (const expressId of group.ids) {
        this.colorOverrides.set(expressId, color);
      }
    }

    this.syncColorOverrides();
    this.updateSnapshot({
      visual: {
        mode: focusIds
          ? "isolate"
          : this.hiddenIds.size
            ? "hide"
            : this.colorOverrides.size
              ? "color"
              : "all",
        label: plan.label ?? null,
        matchCount:
          focusIds?.size ?? (this.hiddenIds.size || this.colorOverrides.size),
        showContext,
        contextOpacity,
      },
    });
    this.renderer.requestRender();
  }

  getVisualPlan(): IfcVisualPlan {
    const groups = new Map<
      readonly [number, number, number, number],
      number[]
    >();
    for (const [id, color] of this.colorOverrides) {
      const ids = groups.get(color);
      if (ids) ids.push(id);
      else groups.set(color, [id]);
    }
    return {
      hiddenIds: [...this.hiddenIds],
      focusIds: this.ghostExceptIds
        ? [...this.ghostExceptIds]
        : this.isolatedIds
          ? [...this.isolatedIds]
          : null,
      colors: [...groups].map(([color, ids]) => ({
        ids,
        color: [...color] as [number, number, number, number],
      })),
      label: this.snapshot.visual.label,
      showContext: this.snapshot.visual.showContext,
      contextOpacity: this.snapshot.visual.contextOpacity,
    };
  }

  resetVisuals() {
    this.applyVisualPlan({ label: null });
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.floorPlans.clear();
    this.modelLoader.dispose();
    this.selectionGeneration += 1;
    this.pointCloudLayers.dispose();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.interactions.detach();
    this.unsubscribeDeviceLoss?.();
    this.unsubscribeDeviceLoss = null;

    if (this.frameHandle !== null) {
      this.runtime.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }

    this.measurementPickHandler = null;
    this.measurementPicking.reset();
    this.renderer.destroy();
    this.models.clear();
    this.federation.clear();
    this.listeners.clear();
    this.cameraRotationListeners.clear();
    this.projectionModeListeners.clear();
  }

  private async initialize() {
    this.updateSnapshot({ phase: "initializing", message: null });
    this.resizeCanvas();

    try {
      this.unsubscribeDeviceLoss = this.renderer.onDeviceLost((info) => {
        if (this.disposed) return;
        this.updateSnapshot({
          phase: "device_lost",
          message: info.message || "Le périphérique WebGPU a été perdu.",
        });
      });
      await Promise.all([
        this.renderer.init(),
        this.modelLoader.initGeometry(),
      ]);

      if (this.disposed) return;

      this.resizeObserver = this.runtime.createResizeObserver(() => {
        if (this.disposed) return;
        this.resizeCanvas();
        this.renderer.requestRender();
      });
      this.resizeObserver.observe(this.canvas);
      this.interactions.attach();
      this.startFrameLoop();
      this.updateSnapshot({ phase: "idle", message: null });
      this.renderer.requestRender();
    } catch (error) {
      if (!this.disposed) {
        this.updateSnapshot({ phase: "error", message: errorMessage(error) });
      }
      throw error;
    }
  }

  private startFrameLoop() {
    const frame = (time: number) => {
      if (this.disposed) return;

      const delta = this.lastFrameTime === null ? 0 : time - this.lastFrameTime;
      this.lastFrameTime = time;
      const scene = this.renderer.getScene();
      let queueFlushed = false;

      if (scene.hasQueuedMeshes()) {
        const device = this.renderer.getGPUDevice();
        const pipeline = this.renderer.getPipeline();
        if (device && pipeline) {
          queueFlushed = scene.flushPending(device, pipeline);
        }
      }

      const cameraAnimating = this.renderer.getCamera().update(delta);
      if (this.cameraRotationListeners.size > 0) {
        const rotation = this.renderer.getCamera().getRotation();
        if (
          !this.lastCameraRotation ||
          rotation.azimuth !== this.lastCameraRotation.azimuth ||
          rotation.elevation !== this.lastCameraRotation.elevation
        ) {
          this.lastCameraRotation = rotation;
          for (const listener of this.cameraRotationListeners)
            listener(rotation);
        }
      }
      if (this.projectionModeListeners.size > 0) {
        this.notifyProjectionMode(
          this.renderer.getCamera().getProjectionMode(),
        );
      }
      this.pointCloudLayers.updateLod();
      if (
        queueFlushed ||
        cameraAnimating ||
        this.renderer.peekRenderRequest()
      ) {
        this.renderer.consumeRenderRequest();
        this.renderScene();
      }

      this.frameHandle = this.runtime.requestFrame(frame);
    };

    this.frameHandle = this.runtime.requestFrame(frame);
  }

  private renderScene(restoreEvictedForCapture = false) {
    this.renderer.render({
      restoreEvictedForCapture,
      clearColor: this.backgroundColor,
      isInteracting: this.interactions.isInteracting,
      selectedId:
        this.snapshot.selection && this.snapshot.activeModelId
          ? this.federation.toGlobalId(
              this.snapshot.activeModelId,
              this.snapshot.selection.expressId,
            )
          : null,
      selectedIds: new Set([...this.selectedEntityIds, ...this.bcfPreviewIds]),
      hiddenIds: new Set([
        ...this.hiddenIds,
        ...this.layerVisibility.hiddenIds,
      ]),
      isolatedIds: this.isolatedIds,
      ghostExceptIds: this.layerVisibility.ghostExceptIds
        ? this.ghostExceptIds
          ? new Set(
              [...this.ghostExceptIds].filter((id) =>
                this.layerVisibility.ghostExceptIds?.has(id),
              ),
            )
          : this.layerVisibility.ghostExceptIds
        : this.ghostExceptIds,
      ghostAlpha: this.snapshot.visual.contextOpacity,
      ...this.sections.renderOptions,
    });
  }

  private notifyProjectionMode(mode: ViewerProjectionMode) {
    if (mode === this.lastProjectionMode) return;
    this.lastProjectionMode = mode;
    for (const listener of this.projectionModeListeners) listener(mode);
  }

  private resizeCanvas() {
    const bounds = this.canvas.getBoundingClientRect();
    this.renderer.resize(
      alignCanvasWidth(bounds.width),
      clampCanvasHeight(bounds.height),
    );
  }

  private pickEntity(x: number, y: number, additive = false) {
    if (this.measurementPickHandler) {
      this.measurementPickHandler(x, y);
      return;
    }
    if (this.sections.pick(x, y)) return;
    const generation = this.modelLoader.generation;
    void this.renderer
      .pick(x, y, {
        hiddenIds: new Set([
          ...this.hiddenIds,
          ...this.layerVisibility.hiddenIds,
        ]),
        isolatedIds: this.isolatedIds,
      })
      .then((hit) => {
        if (!this.modelLoader.isCurrentLoad(generation)) return;
        const model = hit ? this.federation.fromGlobalId(hit.expressId) : null;
        if (model)
          this.selectModelEntity(
            model.modelId,
            model.expressId,
            additive,
            hit?.worldXYZ,
          );
        else this.selectEntity(null, undefined, additive);
      })
      .catch(() => undefined);
  }

  private syncColorOverrides() {
    const scene = this.renderer.getScene();
    if (this.colorOverrides.size === 0) {
      scene.clearColorOverrides();
      return;
    }

    const device = this.renderer.getGPUDevice();
    const pipeline = this.renderer.getPipeline();
    if (device && pipeline) {
      scene.setColorOverrides(this.colorOverrides, device, pipeline);
    }
  }

  private bcfPreviewIds = new Set<number>();
  private selectedEntityIds = new Set<number>();
  setBcfSelection(components: CreateBcfTopicInput["components"]) {
    this.bcfPreviewIds = new Set(
      components.flatMap((component) =>
        component.assetId && component.expressId
          ? [this.federation.toGlobalId(component.assetId, component.expressId)]
          : [],
      ),
    );
    this.renderer.requestRender();
  }
  bcfObjects() {
    return [...this.models].flatMap(([assetId, model]) =>
      model.bimIndex
        .query({})
        .filter((entity) => entity.globalId)
        .map((entity) => ({
          assetId,
          globalId: entity.globalId,
          expressId: entity.expressId,
          name: `${entity.name || entity.globalId} · ${entity.ifcClass}`,
        })),
    );
  }
  focusBcfComponent(
    component: Pick<BcfComponent, "assetId" | "globalId" | "expressId">,
  ) {
    const matches = this.bcfObjects().filter(
      (entity) =>
        entity.globalId === component.globalId &&
        (!component.assetId || entity.assetId === component.assetId),
    );
    if (matches.length !== 1) return false;
    const entity = matches[0]!;
    this.setActiveModel(entity.assetId);
    this.selectEntity(entity.expressId);
    this.frameSelection();
    return true;
  }
  bcfMarkers(topics: BcfMarkerTopic[]) {
    return computeSceneBcfMarkers(this.bcfContext(), topics);
  }
  private bcfContext() {
    return {
      disposed: this.disposed,
      renderer: this.renderer,
      snapshot: this.snapshot,
      models: this.models,
      federation: this.federation,
      modelLoader: this.modelLoader,
      sections: this.sections,
      layerVisibility: this.layerVisibility,
      selectedEntityIds: this.selectedEntityIds,
      isolatedIds: this.isolatedIds,
      ghostExceptIds: this.ghostExceptIds,
      hiddenIds: this.hiddenIds,
      colorOverrides: this.colorOverrides,
      renderScene: () => this.renderScene(true),
      bcfObjects: () => this.bcfObjects(),
      applyVisualPlan: (plan: IfcVisualPlan) => this.applyVisualPlan(plan),
      commitSelection: (selectedIds: number[]) => {
        const selectedId = selectedIds[0] ?? null;
        const selected =
          selectedId === null ? null : this.federation.fromGlobalId(selectedId);
        if (selected && selected.modelId !== this.snapshot.activeModelId) {
          this.setActiveModel(selected.modelId);
        }
        this.selectEntity(selected?.expressId ?? null);
        this.selectedEntityIds = new Set(selectedIds);
        this.updateSnapshot({ selectedElements: this.selectedElements() });
      },
    };
  }

  private updateModelSnapshot(
    assetId: string,
    update: Partial<IfcModelSnapshot>,
  ) {
    const existing = this.snapshot.models.find(
      (model) => model.assetId === assetId,
    );
    const next = existing
      ? { ...existing, ...update }
      : (update as IfcModelSnapshot);
    this.updateSnapshot({
      models: [
        ...this.snapshot.models.filter((model) => model.assetId !== assetId),
        next,
      ],
    });
  }

  private updateVisualSnapshot(update: Partial<IfcVisualSnapshot>) {
    this.updateSnapshot({
      visual: { ...this.snapshot.visual, ...update },
    });
    this.renderer.requestRender();
  }

  private updatePointCloudSnapshot(
    assetId: string,
    update: Partial<PointCloudSnapshot> & Pick<PointCloudSnapshot, "assetId">,
  ): void;
  private updatePointCloudSnapshot(
    assetId: string,
    update: Partial<PointCloudSnapshot>,
  ): void;
  private updatePointCloudSnapshot(
    assetId: string,
    update: Partial<PointCloudSnapshot>,
  ) {
    const existing = this.snapshot.pointClouds.find(
      (pointCloud) => pointCloud.assetId === assetId,
    );
    if (!existing && !update.assetId) return;

    const next = existing
      ? { ...existing, ...update }
      : (update as PointCloudSnapshot);
    this.updateSnapshot({
      pointClouds: [
        ...this.snapshot.pointClouds.filter(
          (pointCloud) => pointCloud.assetId !== assetId,
        ),
        next,
      ],
      ...(this.models.size === 0 && next.phase === "ready"
        ? { phase: "ready" as const }
        : {}),
    });
  }

  private updateSnapshot(update: Partial<IfcViewerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}
