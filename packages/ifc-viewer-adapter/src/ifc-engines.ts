import {
  DEFAULT_HUNG_JOB_TIMEOUT_MS,
  type GeometryProcessor,
  type MeshData,
  type SpatialFrameOffset,
} from "@ifc-lite/geometry";
import { renderFrameWorldOffset } from "@ifc-lite/geometry/world-frame";
import {
  extractGeoreferencingOnDemand,
  type IfcDataStore,
  type IfcParser,
} from "@ifc-lite/parser";

import {
  fromServerGeoreferencing,
  type IfcGeoreference,
} from "./georeferencing";
import { createServerDataStore } from "./server-data-store";
import {
  toBrowserMeshBatch,
  type IfcServerGeometryClient,
} from "./server-geometry";
import { readBytes, withStallLimit } from "./transfer";
import type {
  IfcProcessingSnapshot,
  IfcViewerRuntime,
  LoadIfcInput,
} from "./viewer-types";

/** What an engine knows of a model once all its geometry is delivered. */
export type IfcContent = {
  store: IfcDataStore;
  georeference: IfcGeoreference | null;
  lengthUnitScale: number | undefined;
  /** Offset the engine removed from the authored coordinates, Z up. */
  rtc: SpatialFrameOffset;
  skippedElements: number;
  processing: IfcProcessingSnapshot;
};

export type IfcReadSession = {
  signal: AbortSignal;
  onProcessing: () => void;
  onParserPercent: (percent: number) => void;
  /** Called once, before the first meshes. */
  reserveIds: (maxExpressId: number) => void;
  onMeshes: (meshes: MeshData[]) => void;
};

type BrowserEngine = {
  fetch: IfcViewerRuntime["fetch"];
  parser: IfcParser;
  geometry: GeometryProcessor;
};

const serverReservedIds = 200_000_000;

/** The browser never downloads or parses an IFC that the Rust service processes. */
export async function readServerIfc(
  client: IfcServerGeometryClient,
  session: IfcReadSession,
): Promise<IfcContent> {
  // The highest Express ID is known only when the geometry ends.
  session.reserveIds(serverReservedIds);
  session.onProcessing();
  const { dataModel, maxExpressId, result } = await client.stream(
    (batch) => session.onMeshes(toBrowserMeshBatch(batch.meshes)),
    session.signal,
  );
  session.signal.throwIfAborted();
  if (maxExpressId > serverReservedIds)
    throw new Error("Identifiants IFC hors de la plage de fédération.");
  const { metadata } = result;
  const [x, y, z] = metadata.coordinate_info?.origin_shift ?? [0, 0, 0];
  return {
    store: createServerDataStore(
      dataModel,
      metadata.schema_version,
      0,
      metadata.entity_count,
    ),
    georeference: fromServerGeoreferencing(metadata.georeferencing),
    lengthUnitScale: metadata.length_unit_scale,
    rtc: { x, y, z },
    skippedElements: 0,
    processing: {
      engine: "rust",
      cacheKey: result.cache_key,
      cacheHit: result.stats.from_cache,
    },
  };
}

export async function readBrowserIfc(
  { fetch, parser, geometry }: BrowserEngine,
  downloadUrl: LoadIfcInput["downloadUrl"],
  session: IfcReadSession,
): Promise<IfcContent> {
  const source = await download(fetch, downloadUrl, session.signal);
  session.onProcessing();
  const store = await parser.parseColumnar(source, {
    onProgress: ({ percent }) => session.onParserPercent(Math.round(percent)),
  });
  session.signal.throwIfAborted();
  let maxExpressId = 0;
  for (const id of store.entityIndex.byId.keys())
    if (id > maxExpressId) maxExpressId = id;
  session.reserveIds(maxExpressId);
  const completed = await streamGeometry(
    geometry,
    new Uint8Array(source),
    session,
  );
  return {
    store,
    georeference: extractGeoreferencingOnDemand(store),
    lengthUnitScale: store.lengthUnitScale,
    rtc: renderFrameWorldOffset(completed.coordinateInfo),
    skippedElements: completed.skippedHungElements?.expressIds.length ?? 0,
    processing: { engine: "browser", cacheKey: null, cacheHit: null },
  };
}

async function download(
  fetch: BrowserEngine["fetch"],
  downloadUrl: LoadIfcInput["downloadUrl"],
  signal: AbortSignal,
) {
  const url =
    typeof downloadUrl === "string"
      ? downloadUrl
      : await withStallLimit(downloadUrl());
  signal.throwIfAborted();
  const response = await withStallLimit(fetch(url, { signal }));
  if (!response.ok)
    throw new Error(`Le stockage a répondu HTTP ${response.status}.`);
  const source = await readBytes(response);
  signal.throwIfAborted();
  return source;
}

async function streamGeometry(
  geometry: GeometryProcessor,
  source: Uint8Array,
  { signal, onMeshes }: IfcReadSession,
) {
  for await (const event of geometry.processAdaptive(source, {
    signal,
    hungJobTimeoutMs: DEFAULT_HUNG_JOB_TIMEOUT_MS,
  })) {
    signal.throwIfAborted();
    if (event.type === "batch") onMeshes(event.meshes);
    if (event.type === "complete") return event;
  }
  signal.throwIfAborted();
  throw new Error("La géométrie IFC s’est interrompue avant la fin.");
}
