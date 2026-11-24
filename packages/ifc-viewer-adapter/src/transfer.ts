/** The IFC gateway sends a heartbeat every 15 seconds while it processes a model. */
const stallLimitMs = 120_000;

/** Turn a connection that stops answering into an error the user can retry. */
export async function withStallLimit<T>(step: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error("Le serveur ne répond plus. Réessayez le chargement."),
        ),
      stallLimitMs,
    );
  });
  try {
    return await Promise.race([step, stalled]);
  } finally {
    clearTimeout(timer);
  }
}

/** Yield body chunks, releasing the connection when the consumer stops or stalls. */
export async function* readChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  let finished = false;
  try {
    while (true) {
      const { done, value } = await withStallLimit(reader.read());
      finished = done;
      if (done) return;
      yield value;
    }
  } finally {
    if (!finished) void reader.cancel().catch(() => undefined);
  }
}

export async function readBytes(response: Response): Promise<ArrayBuffer> {
  if (!response.body) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of readChunks(response.body)) {
    chunks.push(chunk);
    length += chunk.byteLength;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
