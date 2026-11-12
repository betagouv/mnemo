import type { Drawing2D } from "@ifc-lite/drawing-2d";
import type { MeshData } from "@ifc-lite/geometry";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computeFloorPlan } from "./floor-plan-worker-client";

const mesh: MeshData = {
  expressId: 1,
  color: [1, 1, 1, 1],
  positions: new Float32Array([0, 0, 0]),
  normals: new Float32Array([0, 1, 0]),
  indices: new Uint32Array([0]),
};
class TestWorker {
  static latest: TestWorker | undefined;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((message: unknown, buffers: ArrayBuffer[]) => {
    structuredClone(message, { transfer: buffers });
  });
  constructor() {
    TestWorker.latest = this;
  }
}
beforeEach(() => {
  TestWorker.latest = undefined;
  vi.stubGlobal("Worker", TestWorker);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([0, 9])(
  "transfers copies and terminates the worker after a %i ms copy",
  async (copyDuration) => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValue(copyDuration);
    const result = computeFloorPlan([mesh], 1.2, new AbortController().signal);
    const worker = await vi.waitUntil(() => TestWorker.latest);
    expect(worker.postMessage).toHaveBeenCalledOnce();
    expect(worker.postMessage.mock.calls[0][1]).toHaveLength(2);
    expect(mesh.positions.byteLength).toBe(12);
    expect(mesh.indices.byteLength).toBe(4);
    const drawing = { lines: [] } as unknown as Drawing2D;
    worker.onmessage!(new MessageEvent("message", { data: { drawing } }));
    expect(await result).toBe(drawing);
    expect(worker.terminate).toHaveBeenCalledOnce();
  },
);

it("terminates active work when aborted", async () => {
  const abort = new AbortController();
  const result = computeFloorPlan([mesh], 1.2, abort.signal);
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  const worker = await vi.waitUntil(() => TestWorker.latest);
  abort.abort();
  await rejected;
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it("propagates worker errors and releases its resources", async () => {
  const result = computeFloorPlan([mesh], 1.2, new AbortController().signal);
  const rejected = expect(result).rejects.toThrow("failure");
  const worker = await vi.waitUntil(() => TestWorker.latest);
  worker.onerror!({ message: "failure" } as ErrorEvent);
  await rejected;
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it("does not start a worker for an already cancelled request", async () => {
  const Worker = vi.fn();
  vi.stubGlobal("Worker", Worker);
  const abort = new AbortController();
  abort.abort();
  await expect(
    computeFloorPlan([mesh], 1.2, abort.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(Worker).not.toHaveBeenCalled();
});

it("surfaces a generation failure instead of returning a partial drawing", async () => {
  const result = computeFloorPlan([mesh], 1.2, new AbortController().signal);
  const rejected = expect(result).rejects.toThrow(
    "Le maillage IFC #123 dépasse la limite",
  );
  const worker = await vi.waitUntil(() => TestWorker.latest);
  worker.onmessage!(
    new MessageEvent("message", {
      data: { error: "Le maillage IFC #123 dépasse la limite" },
    }),
  );
  await rejected;
  expect(worker.terminate).toHaveBeenCalledOnce();
});
