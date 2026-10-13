import type { GeometryProcessor } from "@ifc-lite/geometry";
import type { IfcDataStore, IfcParser } from "@ifc-lite/parser";
import type { Renderer, SectionPlaneAxis } from "@ifc-lite/renderer";
import type { BcfViewpointPayload } from "@mnemo/contracts/bcf";
import type {
  PointCloudFormat,
  PointCloudOctreeAccess,
  PointCloudOctreeStreamHandle,
  PointCloudOctreeStreamOptions,
  PointCloudCopcAccess,
  PointCloudCopcStreamOptions,
  PointCloudStreamHandle,
  PointCloudStreamOptions,
  PointCloudTransform,
} from "@mnemo/point-cloud-viewer-adapter";

import type { IfcBimCatalog, IfcBimIndex } from "./bim-index";
import type { IfcGeoreferencingStatus } from "./georeferencing";
import type { IfcServerGeometryClient } from "./server-geometry";

export type IfcViewerPhase =
  | "idle"
  | "initializing"
  | "downloading"
  | "processing"
  | "ready"
  | "error"
  | "device_lost";

export type IfcViewerSnapshot = {
  phase: IfcViewerPhase;
  parserPercent: number | null;
  meshCount: number;
  entityCount: number | null;
  message: string | null;
  selection: IfcElementDetails | null;
  selectionPhase: "idle" | "loading" | "ready" | "error";
  selectionMessage: string | null;
  catalog: IfcBimCatalog | null;
  processing: IfcProcessingSnapshot;
  models: IfcModelSnapshot[];
  activeModelId: string | null;
  visual: IfcVisualSnapshot;
  section: IfcSectionSnapshot;
  pointClouds: PointCloudSnapshot[];
  pointCloudOptions: PointCloudOptionsSnapshot;
};

export type IfcModelSnapshot = {
  assetId: string;
  fileName: string;
  phase: "downloading" | "processing" | "ready" | "error";
  meshCount: number;
  entityCount: number | null;
  message: string | null;
  catalog?: IfcBimCatalog;
  georeferencing?: IfcGeoreferencingStatus;
};

export type LayerVisibility = "show" | "opacity" | "hide";
export type BimLayerTarget =
  | { kind: "model" }
  | { kind: "unassigned" }
  | { kind: "storey"; expressId: number }
  | { kind: "class"; storeyId: number | null; ifcClass: string }
  | { kind: "element"; expressId: number };

export type PointCloudPhase = "downloading" | "streaming" | "ready" | "error";

export type PointCloudSnapshot = {
  assetId: string;
  fileName: string;
  format: PointCloudFormat;
  phase: PointCloudPhase;
  progress: number;
  pointCount: number;
  totalPointCount: number | null;
  sampleStride: number;
  source: "preview" | "octree" | "copc";
  residentNodeCount: number;
  message: string | null;
};

export type PointCloudOptionsSnapshot = {
  pointSize: number;
};

export type IfcProcessingEngine = "browser" | "rust";

export type IfcProcessingSnapshot = {
  engine: IfcProcessingEngine | null;
  cacheKey: string | null;
  cacheHit: boolean | null;
};

export type IfcVisualMode = "all" | "isolate" | "hide" | "color";

export type IfcVisualSnapshot = {
  mode: IfcVisualMode;
  label: string | null;
  matchCount: number;
  showContext: boolean;
  contextOpacity: number;
};

export type IfcVisualColorGroup = {
  ids: Iterable<number>;
  color: readonly [number, number, number, number];
};

export type IfcVisualPlan = {
  focusIds?: Iterable<number> | null;
  hiddenIds?: Iterable<number>;
  colors?: Iterable<IfcVisualColorGroup>;
  showContext?: boolean;
  contextOpacity?: number;
  label?: string | null;
};

export type IfcSectionSnapshot = {
  active: "plane" | "box" | null;
  plane: {
    source: "axis" | "face" | "two-point";
    axis: SectionPlaneAxis;
    position: number;
    flipped: boolean;
    normal: [number, number, number] | null;
    distance: number | null;
    pickedAt: [number, number, number] | null;
  };
  box: {
    min: [number, number, number];
    max: [number, number, number];
  } | null;
  pickMode: "face" | "two-point" | null;
  draftPoint: [number, number, number] | null;
  trace: {
    start: [number, number, number];
    end: [number, number, number];
  } | null;
  message: string | null;
};

export type IfcPropertyValue =
  string | number | boolean | null | IfcPropertyValue[];

export type IfcValueItem = {
  name: string;
  type: number;
  value: IfcPropertyValue;
  values?: string[];
  unit?: string;
  dataType?: string;
};

export type IfcValueSet = {
  name: string;
  globalId?: string;
  values: IfcValueItem[];
};

export type IfcElementDetails = {
  expressId: number;
  globalId: string;
  ifcClass: string;
  name: string;
  description: string;
  objectType: string;
  tag: string;
  propertySets: IfcValueSet[];
  quantitySets: IfcValueSet[];
};

export type LoadIfcInput = {
  assetId: string;
  fileName: string;
  downloadUrl: string;
  processing?:
    { engine: "browser" } | { engine: "rust"; serverBaseUrl: string };
};

type LoadPointCloudBase = {
  assetId: string;
  fileName: string;
  maxPointsInMemory: number;
  transform: PointCloudTransform;
};

export type LoadPointCloudInput =
  | (LoadPointCloudBase & {
      source: { mode: "preview"; downloadUrl: string };
    })
  | (LoadPointCloudBase & {
      source: {
        mode: "octree";
        access: PointCloudOctreeAccess;
        refreshAccess: () => Promise<PointCloudOctreeAccess>;
      };
    })
  | (LoadPointCloudBase & {
      source: {
        mode: "copc";
        access: PointCloudCopcAccess;
        refreshAccess: () => Promise<PointCloudCopcAccess>;
      };
    });

export type CapturedBcfViewpoint = {
  data: BcfViewpointPayload;
  targetDistance: number;
  snapshot: Blob | null;
};

type FrameRequest = (callback: FrameRequestCallback) => number;
type FrameCancel = (handle: number) => void;

export type IfcViewerRuntime = {
  createRenderer: (canvas: HTMLCanvasElement) => Renderer;
  createGeometryProcessor: () => GeometryProcessor;
  createParser: () => IfcParser;
  createServerClient: (serverBaseUrl: string) => IfcServerGeometryClient;
  readElementDetails: (
    store: IfcDataStore,
    expressId: number,
  ) => IfcElementDetails | null;
  createBimIndex: (
    store: IfcDataStore,
    renderableIds: Iterable<number>,
  ) => IfcBimIndex;
  createPointCloudStream: (
    options: PointCloudStreamOptions,
  ) => PointCloudStreamHandle;
  createPointCloudOctreeStream: (
    options: PointCloudOctreeStreamOptions,
  ) => PointCloudOctreeStreamHandle;
  createPointCloudCopcStream: (
    options: PointCloudCopcStreamOptions,
  ) => PointCloudOctreeStreamHandle;
  fetch: typeof fetch;
  requestFrame: FrameRequest;
  cancelFrame: FrameCancel;
  createResizeObserver: (
    callback: ResizeObserverCallback,
  ) => Pick<ResizeObserver, "observe" | "disconnect">;
};
