import {
  E57StreamingSource,
  LasStreamingSource,
  LazStreamingSource,
  PlyStreamingSource,
  type DecodedPointChunk,
  type PointSourceInfo,
  type StreamingPointSource,
} from "@ifc-lite/pointcloud";

import type { PointCloudFormat } from "./format";

type OpenMessage = {
  kind: "open";
  requestId: number;
  format: PointCloudFormat;
  blob: Blob;
  label?: string;
  stride: number;
  originOffset?: readonly [number, number, number];
};

type NextMessage = {
  kind: "next";
  requestId: number;
  sourceId: number;
  maxPoints: number;
};

type CloseMessage = { kind: "close" | "abort"; sourceId: number };
type WorkerRequest = OpenMessage | NextMessage | CloseMessage;

type OpenSource = {
  source: StreamingPointSource;
  abort: AbortController;
};

const sources = new Map<number, OpenSource>();
let nextSourceId = 1;

function createSource(message: OpenMessage): StreamingPointSource {
  const options = {
    label: message.label,
    downsample: { stride: Math.max(1, message.stride | 0) },
    originOffset: message.originOffset,
  };

  switch (message.format) {
    case "las":
      return new LasStreamingSource(message.blob, options);
    case "laz":
      return new LazStreamingSource(message.blob, options);
    case "ply":
      return new PlyStreamingSource(message.blob, options);
    case "e57":
      return new E57StreamingSource(message.blob, options);
  }
}

function toWireChunk(chunk: DecodedPointChunk) {
  const transfer: Transferable[] = [chunk.positions.buffer];
  const payload: {
    positions: ArrayBufferLike;
    colors?: ArrayBufferLike;
    classifications?: ArrayBufferLike;
    intensities?: ArrayBufferLike;
    pointCount: number;
    bbox: DecodedPointChunk["bbox"];
  } = {
    positions: chunk.positions.buffer,
    pointCount: chunk.pointCount,
    bbox: chunk.bbox,
  };

  if (chunk.colors) {
    payload.colors = chunk.colors.buffer;
    transfer.push(chunk.colors.buffer);
  }
  if (chunk.classifications) {
    payload.classifications = chunk.classifications.buffer;
    transfer.push(chunk.classifications.buffer);
  }
  if (chunk.intensities) {
    payload.intensities = chunk.intensities.buffer;
    transfer.push(chunk.intensities.buffer);
  }

  return { payload, transfer };
}

function post(message: object, transfer: Transferable[] = []) {
  globalThis.postMessage(message, { transfer });
}

async function openSource(message: OpenMessage) {
  const source = createSource(message);
  const abort = new AbortController();

  try {
    const info: PointSourceInfo = await source.open(abort.signal);
    const sourceId = nextSourceId++;
    sources.set(sourceId, { source, abort });
    post({
      kind: "opened",
      requestId: message.requestId,
      sourceId,
      info,
    });
  } catch (error) {
    abort.abort();
    source.close();
    post({
      kind: "error",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function readNext(message: NextMessage) {
  const opened = sources.get(message.sourceId);

  if (!opened) {
    post({
      kind: "error",
      requestId: message.requestId,
      message: `Unknown point-cloud source ${message.sourceId}`,
    });
    return;
  }

  try {
    const chunk = await opened.source.next(
      message.maxPoints,
      opened.abort.signal,
    );
    const wire = chunk ? toWireChunk(chunk) : null;
    post(
      {
        kind: "chunk",
        requestId: message.requestId,
        sourceId: message.sourceId,
        chunk: wire?.payload ?? null,
      },
      wire?.transfer,
    );
  } catch (error) {
    post({
      kind: "error",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function closeSource(sourceId: number, abort: boolean) {
  const opened = sources.get(sourceId);
  if (!opened) return;

  if (abort) opened.abort.abort();
  opened.source.close();
  sources.delete(sourceId);
}

globalThis.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.kind === "open") {
    void openSource(message);
  } else if (message.kind === "next") {
    void readNext(message);
  } else {
    closeSource(message.sourceId, message.kind === "abort");
  }
});
