import { decodePotreeNode, type PotreeMetadata } from "./potree-v2";

type DecodeRequest = {
  kind: "decode";
  requestId: number;
  buffer: ArrayBuffer;
  metadata: PotreeMetadata;
  node: {
    numPoints: number;
    bounds: { min: [number, number, number]; max: [number, number, number] };
  };
};

function respond(message: object, transfer: Transferable[] = []) {
  globalThis.postMessage(message, { transfer });
}

globalThis.addEventListener("message", (event: MessageEvent<DecodeRequest>) => {
  const request = event.data;
  if (request.kind !== "decode") return;

  try {
    const chunk = decodePotreeNode(
      request.buffer,
      request.metadata,
      request.node,
    );
    const transfer: Transferable[] = [chunk.positions.buffer];
    if (chunk.colors) transfer.push(chunk.colors.buffer);
    if (chunk.classifications) transfer.push(chunk.classifications.buffer);
    if (chunk.intensities) transfer.push(chunk.intensities.buffer);
    respond({ kind: "decoded", requestId: request.requestId, chunk }, transfer);
  } catch (error) {
    respond({
      kind: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
