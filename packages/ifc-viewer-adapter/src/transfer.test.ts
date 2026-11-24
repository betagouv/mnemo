import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readBytes, withStallLimit } from "./transfer";

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

it("turns a silent connection into a retryable error", async () => {
  const stalled = expect(
    withStallLimit(new Promise(() => undefined)),
  ).rejects.toThrow("Le serveur ne répond plus");
  await vi.advanceTimersByTimeAsync(120_000);
  await stalled;
});

it("releases the connection of a download that stops midway", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => controller.enqueue(Uint8Array.of(1)),
    cancel,
  });
  const stalled = expect(readBytes(new Response(body))).rejects.toThrow(
    "Le serveur ne répond plus",
  );
  await vi.advanceTimersByTimeAsync(120_000);
  await stalled;
  expect(cancel).toHaveBeenCalledOnce();
});

it("accepts a slow download that keeps progressing", async () => {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      await new Promise((resolve) => setTimeout(resolve, 100_000));
      controller.enqueue(Uint8Array.of(sent));
      if (++sent === 3) controller.close();
    },
  });
  const bytes = readBytes(new Response(body));
  await vi.advanceTimersByTimeAsync(400_000);
  expect([...new Uint8Array(await bytes)]).toEqual([0, 1, 2]);
});
