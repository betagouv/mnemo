import type { BcfSceneComponent } from "./bcf-components";
import {
  createViewpoint,
  computeMarkerPositions,
  translateViewpoint,
  viewpointFromWorld,
  extractViewpointState,
  parseARGBColor,
  toARGBColor,
  type BCFViewpoint,
  type ViewerCameraState,
} from "@ifc-lite/bcf";
import type { FederationRegistry, Renderer } from "@ifc-lite/renderer";
import type {
  BcfViewpointPayload,
  BcfMarkerTopic,
  CreateBcfTopicInput,
} from "@mnemo/contracts/bcf";
import { indexBcfComponents } from "./bcf-components";
import { captureBcfSnapshot } from "./bcf-snapshot";
import type { BimLayerVisibility } from "./bim-layer-visibility";
import type { IfcModelLoader, LoadedIfcModel } from "./ifc-model-loader";
import type { SectionController } from "./section-controller";
import type {
  CapturedBcfViewpoint,
  IfcViewerSnapshot,
  IfcVisualPlan,
} from "./viewer-types";

type BcfSceneContext = {
  disposed: boolean;
  renderer: Renderer;
  snapshot: IfcViewerSnapshot;
  models: ReadonlyMap<string, LoadedIfcModel>;
  federation: FederationRegistry;
  modelLoader: Pick<IfcModelLoader, "renderOrigin">;
  sections: Pick<SectionController, "captureBcfPlanes" | "applyBcfPlanes">;
  layerVisibility: Pick<
    BimLayerVisibility,
    "ghostExceptIds" | "hiddenIds" | "reset"
  >;
  selectedEntityIds: ReadonlySet<number>;
  isolatedIds: ReadonlySet<number> | null;
  ghostExceptIds: ReadonlySet<number> | null;
  hiddenIds: ReadonlySet<number>;
  colorOverrides: ReadonlyMap<number, [number, number, number, number]>;
  renderScene: () => void;
  bcfObjects: () => BcfSceneComponent[];
  applyVisualPlan: (plan: IfcVisualPlan) => void;
  commitSelection: (ids: number[]) => void;
};

export async function captureSceneBcfViewpoint(
  context: BcfSceneContext,
  components?: CreateBcfTopicInput["components"],
): Promise<CapturedBcfViewpoint> {
  if (context.disposed || !context.snapshot.activeModelId) {
    throw new Error("La maquette doit être prête avant de capturer une vue.");
  }

  // Draw and copy in one JS task, before the compositor releases the texture.
  context.renderScene();
  const visibleIds = context.isolatedIds;
  const fadedOpaqueIds = context.layerVisibility.ghostExceptIds;
  const ghostOpaqueIds = context.ghostExceptIds;
  const ghostColor = toARGBColor(
    220,
    220,
    220,
    context.snapshot.visual.contextOpacity * 255,
  );
  const colorsByArgb = new Map<string, number[]>();
  for (const [expressId, color] of context.colorOverrides) {
    const argb = toARGBColor(
      color[0] * 255,
      color[1] * 255,
      color[2] * 255,
      color[3] * 255,
    );
    const ids = colorsByArgb.get(argb) ?? [];
    ids.push(expressId);
    colorsByArgb.set(argb, ids);
  }

  const hidden = new Set([
    ...context.hiddenIds,
    ...context.layerVisibility.hiddenIds,
  ]);
  const fadedIds = [...context.models]
    .flatMap(([assetId, model]) =>
      [...model.meshIds].map((id) =>
        context.federation.toGlobalId(assetId, id),
      ),
    )
    .filter(
      (id) =>
        !hidden.has(id) &&
        ((fadedOpaqueIds && !fadedOpaqueIds.has(id)) ||
          (ghostOpaqueIds && !ghostOpaqueIds.has(id))),
    );
  if (fadedIds.length) colorsByArgb.set(ghostColor, fadedIds);
  const references = indexBcfComponents(context.bcfObjects(), (asset, id) =>
    context.federation.toGlobalId(asset, id),
  );
  const { snapshot, state } = await captureBcfSnapshot(context.renderer, () => {
    const camera = context.renderer.getCamera();
    const cameraState: ViewerCameraState = {
      position: camera.getPosition(),
      target: camera.getTarget(),
      up: camera.getUp(),
      fov: camera.getFOV(),
      aspectRatio: camera.getAspect(),
      isOrthographic: camera.getProjectionMode() === "orthographic",
      orthoScale: camera.getOrthoSize(),
    };
    const created = createViewpoint({
      camera: cameraState,
      selectedGuids: components
        ? components.map((component) => component.globalId)
        : references
            .encode([...context.selectedEntityIds])
            .flatMap((ref) => (ref.ifcGuid ? [ref.ifcGuid] : [])),
      hiddenGuids: references
        .encode(hidden)
        .flatMap((ref) => (ref.ifcGuid ? [ref.ifcGuid] : [])),
      visibleGuids: visibleIds
        ? references
            .encode([...visibleIds].filter((id) => !hidden.has(id)))
            .flatMap((ref) => (ref.ifcGuid ? [ref.ifcGuid] : []))
        : undefined,
      coloredGuids: [...colorsByArgb].map(([color, ids]) => ({
        color,
        guids: references
          .encode(ids)
          .flatMap((ref) => (ref.ifcGuid ? [ref.ifcGuid] : [])),
      })),
    });
    created.components ??= {};
    created.components.selection = components
      ? components.map((component) =>
          component.assetId && component.expressId
            ? references.reference({
                assetId: component.assetId,
                expressId: component.expressId,
                globalId: component.globalId,
              })
            : { ifcGuid: component.globalId },
        )
      : references.encode([...context.selectedEntityIds]);
    if (created.components.visibility)
      created.components.visibility.exceptions = references.encode(
        visibleIds ? [...visibleIds].filter((id) => !hidden.has(id)) : hidden,
      );
    if (created.components.coloring)
      created.components.coloring = [...colorsByArgb].map(([color, ids]) => ({
        color,
        components: references.encode(ids),
      }));
    created.clippingPlanes = context.sections.captureBcfPlanes();
    return {
      data: translateViewpoint(created, context.modelLoader.renderOrigin),
      targetDistance: Math.max(camera.getDistance(), 0.001),
    };
  });
  return { ...state, snapshot };
}

export function applySceneBcfViewpoint(
  context: BcfSceneContext,
  data: BcfViewpointPayload,
  targetDistance: number,
) {
  if (context.disposed || !context.snapshot.activeModelId) return [];

  const references = indexBcfComponents(context.bcfObjects(), (asset, id) =>
    context.federation.toGlobalId(asset, id),
  );
  const unresolved = new Set<string>();
  const resolve = (refs: import("@ifc-lite/bcf").BCFComponent[]) => {
    const result = references.resolve(refs);
    result.unresolved.forEach((id) => unresolved.add(id));
    return result.ids;
  };
  const state = extractViewpointState(
    viewpointFromWorld(data as BCFViewpoint, context.modelLoader.renderOrigin),
    undefined,
    targetDistance,
  );
  const exceptions = resolve(data.components?.visibility?.exceptions ?? []);
  const visibleIds = state.visibleGuids !== null ? exceptions : [];
  const hiddenIds = state.visibleGuids === null ? exceptions : [];
  const colors = (data.components?.coloring ?? []).map(
    ({ color, components }) => {
      const rgba = parseARGBColor(color);
      return {
        ids: resolve(components),
        color: [
          rgba.r / 255,
          rgba.g / 255,
          rgba.b / 255,
          rgba.a / 255,
        ] as const,
      };
    },
  );

  context.sections.applyBcfPlanes(
    viewpointFromWorld(data as BCFViewpoint, context.modelLoader.renderOrigin)
      .clippingPlanes ?? [],
  );
  context.layerVisibility.reset();
  context.applyVisualPlan({
    focusIds: state.visibleGuids !== null ? visibleIds : null,
    hiddenIds,
    colors,
    showContext: false,
    contextOpacity: context.snapshot.visual.contextOpacity,
    label: "Viewpoint BCF",
  });

  if (state.camera) {
    const camera = context.renderer.getCamera();
    camera.stopInertia();
    camera.setProjectionMode(
      state.camera.isOrthographic ? "orthographic" : "perspective",
    );
    camera.setPosition(
      state.camera.position.x,
      state.camera.position.y,
      state.camera.position.z,
    );
    camera.setTarget(
      state.camera.target.x,
      state.camera.target.y,
      state.camera.target.z,
    );
    camera.setUp(state.camera.up.x, state.camera.up.y, state.camera.up.z);
    camera.setFOV(state.camera.fov);
    if (state.camera.isOrthographic && state.camera.orthoScale) {
      camera.setOrthoSize(state.camera.orthoScale);
    }
  }

  const selectedIds = resolve(data.components?.selection ?? []);
  context.commitSelection(selectedIds);
  context.renderer.requestRender();
  return [...unresolved];
}

export function computeSceneBcfMarkers(
  context: BcfSceneContext,
  topics: BcfMarkerTopic[],
) {
  if (!topics.length) return [];
  const idsByGuid = new Map<string, number[]>();
  for (const entity of context.bcfObjects()) {
    const ids = idsByGuid.get(entity.globalId) ?? [];
    ids.push(context.federation.toGlobalId(entity.assetId, entity.expressId));
    idsByGuid.set(entity.globalId, ids);
  }
  return topics.flatMap((topic) => {
    if (!topic.viewpoint) return [];
    const view = viewpointFromWorld(
      topic.viewpoint,
      context.modelLoader.renderOrigin,
    );
    const positioned = computeMarkerPositions(
      [
        {
          guid: topic.id,
          title: topic.title,
          topicStatus: topic.status,
          topicType: topic.type,
          priority: topic.priority,
          comments: [],
          viewpoints: [view],
        },
      ],
      (guid) => {
        const ids = idsByGuid.get(guid) ?? [];
        return ids.length === 1
          ? context.renderer.getScene().getEntityBoundingBox(ids[0]!)
          : null;
      },
      { targetDistance: topic.targetDistance },
    );
    // A camera position alone is not an accurate location for a remark.
    return positioned
      .filter((marker) => marker.positionSource !== "camera-position")
      .map((marker) => ({ ...marker, index: topic.number }));
  });
}
