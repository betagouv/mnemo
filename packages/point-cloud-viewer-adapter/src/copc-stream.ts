import {
  createCopcLodTree,
  HttpRangeSource,
  openCopcWorkerReader,
  parseLasHeader,
  selectLod,
  type CopcLodTree,
  type CopcWorkerReader,
  type LodSelectedNode,
} from "@ifc-lite/pointcloud";
import type { PointCloudChunkInput } from "@ifc-lite/renderer";

import { copcLodCamera } from "./copc-camera";
import type { PointCloudLodView } from "./octree-lod";
import type { PointCloudOctreeSwap } from "./octree-stream";

const firstFramePoints = 25_000;
const firstPassPoints = 150_000;
const maxNodes = 96;
const concurrency = 8;
const maxCachedPoints = 500_000;
const refreshMarginMs = 30_000;

export type PointCloudCopcAccess = {
  copcUrl: string;
  expiresAt: string;
};

export type PointCloudCopcStreamOptions = {
  access: PointCloudCopcAccess;
  refreshAccess: () => Promise<PointCloudCopcAccess>;
  signal?: AbortSignal;
  onOpen?: (metadata: { totalPointCount: number; spacing: number }) => void;
  onSwap: (swap: PointCloudOctreeSwap) => void;
  onError?: (error: Error) => void;
  runtime?: {
    fetch: typeof fetch;
    openReader: typeof openCopcWorkerReader;
    now: () => number;
  };
};

export type PointCloudCopcStreamHandle = {
  ready: Promise<void>;
  update(view: PointCloudLodView): void;
  cancel(): void;
};

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Stream one signed COPC object: a tiny root first, then camera-selected nodes. */
export function createPointCloudCopcStream(options: PointCloudCopcStreamOptions): PointCloudCopcStreamHandle {
  const runtime = options.runtime ?? {
    fetch: globalThis.fetch.bind(globalThis),
    openReader: openCopcWorkerReader,
    now: Date.now,
  };
  const lifetime = new AbortController();
  options.signal?.addEventListener("abort", () => lifetime.abort(), { once: true });
  if (options.signal?.aborted) lifetime.abort();
  let access = options.access;
  let reader: CopcWorkerReader | null = null;
  let tree: CopcLodTree | null = null;
  let latestView: PointCloudLodView | null = null;
  let updateAbort: AbortController | null = null;
  let opening: Promise<void> | null = null;
  let settled = false;
  const resident = new Map<string, PointCloudChunkInput>();
  const cache = new Map<string, PointCloudChunkInput>();
  let cachedPoints = 0;
  let resolveReady: () => void = () => undefined;
  let rejectReady: (error: Error) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  function publish(add: PointCloudOctreeSwap["add"], remove: string[], complete: boolean) {
    options.onSwap({
      add,
      remove,
      pointCount: [...resident.values()].reduce((sum, chunk) => sum + chunk.pointCount, 0),
      nodeCount: resident.size,
      complete,
    });
  }

  function report(error: unknown) {
    if (lifetime.signal.aborted || isAbort(error)) return;
    const parsed = asError(error);
    options.onError?.(parsed);
    if (!settled) {
      settled = true;
      rejectReady(parsed);
    }
  }

  function remember(key: string, chunk: PointCloudChunkInput) {
    if (chunk.pointCount > maxCachedPoints) return;
    const previous = cache.get(key);
    if (previous) cachedPoints -= previous.pointCount;
    cache.delete(key);
    cache.set(key, chunk);
    cachedPoints += chunk.pointCount;
    while (cachedPoints > maxCachedPoints) {
      const oldest = cache.keys().next().value;
      if (!oldest) break;
      const evicted = cache.get(oldest);
      cache.delete(oldest);
      cachedPoints -= evicted?.pointCount ?? 0;
    }
  }

  async function open() {
    if (opening) return opening;
    opening = (async () => {
      if (runtime.now() >= Date.parse(access.expiresAt) - refreshMarginMs) {
        access = await options.refreshAccess();
      }
      const source = await HttpRangeSource.open(access.copcUrl, {
        fetch: runtime.fetch,
        signal: lifetime.signal,
      });
      const header = parseLasHeader(await source.read(0, 375, lifetime.signal));
      const originOffset = header.bbox.min;
      const opened = await runtime.openReader({
        source: { kind: "http", url: access.copcUrl },
        originOffset,
        signal: lifetime.signal,
      });
      if (lifetime.signal.aborted) {
        opened.close();
        return;
      }
      reader = opened;
      tree = createCopcLodTree(opened.hierarchy, opened.file.info, originOffset);
      options.onOpen?.({
        totalPointCount: opened.file.header.pointCount,
        spacing: opened.file.info.spacing,
      });
      const root = tree.root;
      if (root && root.entry.pointCount > 0 && !resident.has(`${root.id}:root`)) {
        const chunk = await opened.readNode(root.entry, {
          stride: Math.max(1, Math.ceil(root.entry.pointCount / firstFramePoints)),
          signal: lifetime.signal,
        });
        if (!lifetime.signal.aborted) {
          resident.set(`${root.id}:root`, chunk);
          publish([{ nodeId: `${root.id}:root`, chunk }], [], false);
        }
      }
      if (latestView && !lifetime.signal.aborted) schedule(latestView);
    })().finally(() => { opening = null; });
    return opening;
  }

  async function selection(view: PointCloudLodView, budget: number, signal: AbortSignal) {
    const currentTree = tree;
    if (!currentTree?.root || !reader) return [];
    const camera = copcLodCamera(view);
    if (!camera) return [];
    for (let round = 0; round < 8; round += 1) {
      const selected = selectLod(currentTree.root, camera, {
        pointBudget: budget,
        pixelThreshold: view.pixelThreshold ? view.pixelThreshold * 64 : undefined,
        maxNodes,
      });
      const pages = new Map<number, ReturnType<CopcLodTree["pendingPagesUnder"]>[number]>();
      for (const node of selected.needsChildren) {
        for (const page of currentTree.pendingPagesUnder(node)) pages.set(page.offset, page);
      }
      if (!pages.size || round === 7) return selected.nodes;
      await Promise.all([...pages.values()].slice(0, 16).map((page) => reader?.loadPage(page, signal)));
      signal.throwIfAborted();
    }
    return [];
  }

  async function run(view: PointCloudLodView, signal: AbortSignal) {
    for (const budget of [Math.min(firstPassPoints, view.pointBudget), view.pointBudget]) {
      signal.throwIfAborted();
      const nodes = await selection(view, budget, signal);
      const wanted = nodes.map((item: LodSelectedNode) => ({
        ...item,
        stride: 2 ** Math.ceil(Math.log2(Math.max(1, item.stride))),
      }));
      const target = new Set(wanted.map((item) => `${item.node.id}:${item.stride}`));
      for (let start = 0; start < wanted.length; start += concurrency) {
        await Promise.all(wanted.slice(start, start + concurrency).map(async (item) => {
          const key = `${item.node.id}:${item.stride}`;
          if (resident.has(key)) return;
          const chunk = cache.get(key) ?? await reader?.readNode(
            (item.node as NonNullable<CopcLodTree["root"]>).entry,
            { stride: item.stride, signal },
          );
          signal.throwIfAborted();
          if (!chunk) return;
          remember(key, chunk);
          resident.set(key, chunk);
          publish([{ nodeId: key, chunk }], [], false);
        }));
      }
      signal.throwIfAborted();
      const remove = [...resident.keys()].filter((key) => !target.has(key));
      for (const key of remove) resident.delete(key);
      publish([], remove, budget === view.pointBudget);
    }
    if (!settled) {
      settled = true;
      resolveReady();
    }
  }

  function schedule(view: PointCloudLodView) {
    updateAbort?.abort();
    const controller = new AbortController();
    updateAbort = controller;
    const signal = AbortSignal.any([lifetime.signal, controller.signal]);
    void run(view, signal).catch((error) => {
      if (!signal.aborted) report(error);
    });
  }

  void open().catch(report);
  return {
    ready,
    update(view) {
      latestView = view;
      if (reader) {
        if (runtime.now() >= Date.parse(access.expiresAt) - refreshMarginMs) {
          updateAbort?.abort();
          reader.close();
          reader = null;
          tree = null;
          void open().catch(report);
        } else schedule(view);
      }
    },
    cancel() {
      lifetime.abort();
      updateAbort?.abort();
      reader?.close();
      if (!settled) {
        settled = true;
        rejectReady(new DOMException("Aborted", "AbortError"));
      }
    },
  };
}
