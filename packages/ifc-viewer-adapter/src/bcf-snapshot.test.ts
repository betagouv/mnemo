import { afterEach, describe, it, expect, vi } from "vitest";
import type { Renderer } from "@ifc-lite/renderer";
import { captureBcfSnapshot } from "./bcf-snapshot";
afterEach(() => vi.unstubAllGlobals());
function renderer(screenshot: string | null) {
  return { captureScreenshot: async () => screenshot } as unknown as Renderer;
}
function pixels(alpha: number) {
  vi.stubGlobal("createImageBitmap", async () => ({ close() {} }));
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        return {
          drawImage() {},
          getImageData() {
            return { data: new Uint8ClampedArray([10, 20, 30, alpha]) };
          },
        };
      }
    },
  );
}
describe("BCF full-frame snapshots", () => {
  it("reads metadata alongside the PNG, and keeps its complete bytes", async () => {
    pixels(255);
    const state = { aspectRatio: 2 };
    const result = await captureBcfSnapshot(
      renderer("data:image/png;base64,AQID"),
      () => state,
    );
    expect(result.state).toBe(state);
    expect(new Uint8Array(await result.snapshot.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
  it("rejects an unavailable frame", async () => {
    await expect(
      captureBcfSnapshot(renderer(null), () => null),
    ).rejects.toThrow("pas disponible");
  });
  it("rejects transparent frames produced by invalid GPU textures", async () => {
    pixels(0);
    await expect(
      captureBcfSnapshot(renderer("data:image/png;base64,AQID"), () => null),
    ).rejects.toThrow("pas pu rendre");
  });
});
