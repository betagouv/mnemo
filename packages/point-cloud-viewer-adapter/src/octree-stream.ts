import type { PointCloudChunkInput } from "@ifc-lite/renderer";

import { selectPointCloudLod, type PointCloudLodView } from "./octree-lod";
import {
  createPotreeRoot,
  parsePotreeHierarchyPage,
  parsePotreeV2Metadata,
  type PotreeMetadata,
  type PotreeNode,
} from "./potree-v2";

const maxMetadataBytes = 2 * 1_024 * 1_024;
const maxHierarchyPageBytes = 64 * 1_024 * 1_024;
const maxNodeBytes = 128 * 1_024 * 1_024;
const maxGroupedNodeBytes = 8 * 1_024 * 1_024;
const nodeFetchConcurrency = 12;
const accessRefreshMarginMs = 30_000;

export type PointCloudOctreeAccess = {
  metadataUrl: string;
  hierarchyUrl: string;
  octreeUrl: string;
  expiresAt: string;
};

export type PointCloudOctreeSwap = {
  add: Array<{ nodeId: string; chunk: PointCloudChunkInput }>;
  remove: string[];
  pointCount: number;
  nodeCount: number;
};

export type PointCloudOctreeStreamOptions = {
  access: PointCloudOctreeAccess;
  refreshAccess: () => Promise<PointCloudOctreeAccess>;
  signal?: AbortSignal;
  onOpen?: (metadata: { totalPointCount: number; spacing: number }) => void;
  onSwap: (swap: PointCloudOctreeSwap) => void;
  onError?: (error: Error) => void;
  runtime?: Partial<PointCloudOctreeRuntime>;
};

export type PointCloudOctreeStreamHandle = {
  ready: Promise<void>;
  update(view: PointCloudLodView): void;
  cancel(): void;
};

type DecodePort = {
  decode(
    buffer: ArrayBuffer,
    metadata: PotreeMetadata,
    node: PotreeNode,
    signal: AbortSignal,
  ): Promise<PointCloudChunkInput>;
  close(): void;
};

export type PointCloudOctreeRuntime = {
  fetch: typeof fetch;
  now: () => number;
  createDecoder: () => DecodePort;
};

class WorkerPotreeDecoder implements DecodePort {
  private readonly worker = new Worker(
    new URL("./potree-octree-decode.worker.ts", import.meta.url),
    { name: "mnemo-potree-octree-decode" },
  );
  private readonly pending = new Map<
    number,
    {
      resolve: (chunk: PointCloudChunkInput) => void;
      reject: (error: Error) => void;
    }
  >();
  private nextRequestId = 1;

  constructor() {
    this.worker.addEventListener("message", (event: MessageEvent) => {
      const response = event.data as {
        kind: "decoded" | "error";
        requestId: number;
        chunk?: PointCloudChunkInput;
        message?: string;
      };
      const request = this.pending.get(response.requestId);
      if (!request) return;
      this.pending.delete(response.requestId);
      if (response.kind === "decoded" && response.chunk) {
        request.resolve(response.chunk);
      } else {
        request.reject(new Error(response.message ?? "Potree decoding failed"));
      }
    });
    this.worker.addEventListener("error", (event) => {
      this.failAll(new Error(event.message || "Potree decoder worker crashed"));
    });
  }

  decode(
    buffer: ArrayBuffer,
    metadata: PotreeMetadata,
    node: PotreeNode,
    signal: AbortSignal,
  ) {
    if (signal.aborted)
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    const requestId = this.nextRequestId++;
    return new Promise<PointCloudChunkInput>((resolve, reject) => {
      const abort = () => {
        this.pending.delete(requestId);
        reject(new DOMException("Aborted", "AbortError"));
      };
      this.pending.set(requestId, {
        resolve: (chunk) => {
          signal.removeEventListener("abort", abort);
          resolve(chunk);
        },
        reject: (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      });
      signal.addEventListener("abort", abort, { once: true });
      this.worker.postMessage(
        {
          kind: "decode",
          requestId,
          buffer,
          metadata,
          node: { numPoints: node.numPoints, bounds: node.bounds },
        },
        [buffer],
      );
    });
  }

  close() {
    this.worker.terminate();
    this.failAll(new DOMException("Decoder closed", "AbortError"));
  }

  private failAll(error: Error) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}

function defaultRuntime(): PointCloudOctreeRuntime {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    now: Date.now,
    createDecoder: () => new WorkerPotreeDecoder(),
  };
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

class PotreeRangeReader {
  private access: PointCloudOctreeAccess;
  private refresh: Promise<PointCloudOctreeAccess> | null = null;

  constructor(
    access: PointCloudOctreeAccess,
    private readonly refreshAccess: () => Promise<PointCloudOctreeAccess>,
    private readonly runtime: Pick<PointCloudOctreeRuntime, "fetch" | "now">,
    private readonly signal: AbortSignal,
  ) {
    this.access = access;
  }

  async metadata() {
    const response = await this.request("metadataUrl");
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > maxMetadataBytes) {
      await response.body?.cancel();
      throw new Error("Potree metadata exceeds the safety limit");
    }
    const text = await response.text();
    if (text.length > maxMetadataBytes) {
      throw new Error("Potree metadata exceeds the safety limit");
    }
    return parsePotreeV2Metadata(JSON.parse(text) as unknown);
  }

  hierarchy(offset: bigint, size: bigint) {
    return this.range("hierarchyUrl", offset, size, maxHierarchyPageBytes);
  }

  octree(offset: bigint, size: bigint) {
    return this.range("octreeUrl", offset, size, maxNodeBytes);
  }

  private async range(
    kind: "hierarchyUrl" | "octreeUrl",
    offset: bigint,
    size: bigint,
    maximum: number,
  ) {
    if (size <= BigInt(0) || size > BigInt(maximum)) {
      throw new Error(`Potree range size ${size} is outside the safety limit`);
    }
    const response = await this.request(kind, {
      Range: `bytes=${offset}-${offset + size - BigInt(1)}`,
    });
    if (response.status !== 206) {
      await response.body?.cancel();
      throw new Error(
        `Point-cloud storage ignored a byte-range request (${response.status})`,
      );
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== Number(size)) {
      throw new Error(
        `Point-cloud range is incomplete: expected ${size}, received ${buffer.byteLength}`,
      );
    }
    return buffer;
  }

  private async request(
    kind: "metadataUrl" | "hierarchyUrl" | "octreeUrl",
    headers?: HeadersInit,
    refreshed = false,
  ): Promise<Response> {
    if (
      !refreshed &&
      Date.parse(this.access.expiresAt) <=
        this.runtime.now() + accessRefreshMarginMs
    ) {
      await this.renew();
    }
    const response = await this.runtime.fetch(this.access[kind], {
      headers,
      signal: this.signal,
    });
    if (!refreshed && (response.status === 401 || response.status === 403)) {
      await response.body?.cancel();
      await this.renew();
      return this.request(kind, headers, true);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Point-cloud storage responded HTTP ${response.status}`);
    }
    return response;
  }

  private async renew() {
    this.refresh ??= this.refreshAccess().finally(() => {
      this.refresh = null;
    });
    this.access = await this.refresh;
  }
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++;
        results[index] = await operation(values[index]);
      }
    }),
  );
  return results;
}

type NodeRange = {
  offset: bigint;
  size: bigint;
  nodes: PotreeNode[];
};

function groupContiguousNodes(nodes: PotreeNode[]): NodeRange[] {
  const ranges: NodeRange[] = [];
  const sorted = [...nodes].sort((left, right) =>
    left.byteOffset < right.byteOffset
      ? -1
      : left.byteOffset > right.byteOffset
        ? 1
        : 0,
  );

  for (const node of sorted) {
    const last = ranges.at(-1);
    if (
      last &&
      last.offset + last.size === node.byteOffset &&
      last.size + node.byteSize <= BigInt(maxGroupedNodeBytes)
    ) {
      last.size += node.byteSize;
      last.nodes.push(node);
    } else {
      ranges.push({
        offset: node.byteOffset,
        size: node.byteSize,
        nodes: [node],
      });
    }
  }

  return ranges;
}

class PotreeOctreeStream implements PointCloudOctreeStreamHandle {
  readonly ready: Promise<void>;
  private readonly abort = new AbortController();
  private readonly decoder: DecodePort;
  private readonly reader: PotreeRangeReader;
  private metadata: PotreeMetadata | null = null;
  private root: PotreeNode | null = null;
  private view: PointCloudLodView | null = null;
  private resident = new Map<string, PotreeNode>();
  private residentPointCount = 0;
  private revision = 0;
  private running = false;
  private dirty = false;
  private failed = false;

  constructor(
    private readonly options: PointCloudOctreeStreamOptions,
    runtimeOverrides: Partial<PointCloudOctreeRuntime>,
  ) {
    const runtime = { ...defaultRuntime(), ...runtimeOverrides };
    this.decoder = runtime.createDecoder();
    this.reader = new PotreeRangeReader(
      options.access,
      options.refreshAccess,
      runtime,
      this.abort.signal,
    );
    options.signal?.addEventListener("abort", () => this.cancel(), {
      once: true,
    });
    this.ready = this.open();
  }

  update(view: PointCloudLodView) {
    if (this.abort.signal.aborted || this.failed) return;
    this.view = view;
    this.revision++;
    this.dirty = true;
    void this.drain();
  }

  cancel() {
    if (this.abort.signal.aborted) return;
    this.abort.abort();
    this.decoder.close();
  }

  private async open() {
    try {
      const metadata = await this.reader.metadata();
      const root = createPotreeRoot(metadata);
      const hierarchy = await this.reader.hierarchy(
        root.hierarchyByteOffset,
        root.hierarchyByteSize,
      );
      parsePotreeHierarchyPage(root, hierarchy);
      this.metadata = metadata;
      this.root = root;
      this.options.onOpen?.({
        totalPointCount: metadata.points,
        spacing: metadata.spacing,
      });
      this.dirty = true;
      await this.drain();
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  private async drain() {
    if (this.running || !this.metadata || !this.root || !this.view) return;
    this.running = true;
    try {
      while (this.dirty && !this.abort.signal.aborted) {
        this.dirty = false;
        const revision = this.revision;
        let selection = selectPointCloudLod(this.root, this.view);
        if (selection.hierarchyPages.length) {
          await mapConcurrent(selection.hierarchyPages, 4, async (node) => {
            const page = await this.reader.hierarchy(
              node.hierarchyByteOffset,
              node.hierarchyByteSize,
            );
            parsePotreeHierarchyPage(node, page);
          });
          selection = selectPointCloudLod(this.root, this.view);
          this.dirty ||= selection.hierarchyPages.length > 0;
        }

        const desired = new Set(selection.nodes.map((node) => node.name));
        const missing = selection.nodes.filter(
          (node) => !this.resident.has(node.name) && node.byteSize > BigInt(0),
        );
        const ranges = groupContiguousNodes(missing);
        let completedRanges = 0;
        await mapConcurrent(ranges, nodeFetchConcurrency, async (range) => {
          if (revision !== this.revision || this.abort.signal.aborted) return;
          const buffer = await this.reader.octree(range.offset, range.size);
          let offset = 0;
          const decoded = await Promise.all(
            range.nodes.map(async (node) => {
              const size = Number(node.byteSize);
              const nodeBuffer = buffer.slice(offset, offset + size);
              offset += size;
              return {
                nodeId: node.name,
                chunk: await this.decoder.decode(
                  nodeBuffer,
                  this.metadata as PotreeMetadata,
                  node,
                  this.abort.signal,
                ),
              };
            }),
          );
          if (revision !== this.revision || this.abort.signal.aborted) return;

          for (const node of range.nodes) {
            this.resident.set(node.name, node);
            this.residentPointCount += node.numPoints;
          }
          completedRanges++;
          const finished = completedRanges === ranges.length;
          const remove = finished ? this.removeUndesired(desired) : [];
          this.publish(decoded, remove);
        });
        if (this.abort.signal.aborted) return;
        if (revision !== this.revision) {
          this.dirty = true;
          continue;
        }
        if (ranges.length === 0) {
          this.publish([], this.removeUndesired(desired));
        }
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.running = false;
      if (this.dirty && !this.failed) void this.drain();
    }
  }

  private removeUndesired(desired: Set<string>) {
    const remove = [...this.resident.keys()].filter(
      (nodeId) => !desired.has(nodeId),
    );
    for (const nodeId of remove) {
      this.residentPointCount -= this.resident.get(nodeId)?.numPoints ?? 0;
      this.resident.delete(nodeId);
    }
    return remove;
  }

  private publish(add: PointCloudOctreeSwap["add"], remove: string[]) {
    this.options.onSwap({
      add,
      remove,
      pointCount: this.residentPointCount,
      nodeCount: this.resident.size,
    });
  }

  private fail(error: unknown) {
    if (this.abort.signal.aborted || this.failed) return;
    this.failed = true;
    this.abort.abort();
    this.decoder.close();
    this.options.onError?.(asError(error));
  }
}

export function createPointCloudOctreeStream(
  options: PointCloudOctreeStreamOptions,
): PointCloudOctreeStreamHandle {
  return new PotreeOctreeStream(options, options.runtime ?? {});
}
