import { describe, expect, it, vi } from "vitest";
import type { FloorPlanDrawing } from "@mnemo/ifc-viewer-adapter";
import { drawFloorPlan, type styleFloorPlan } from "./floor-plan-renderer";
import { fitPlan } from "./floor-plan-navigation";
import { FloorPlanRaster } from "./floor-plan-raster";

vi.mock("./floor-plan-renderer", () => ({ drawFloorPlan: vi.fn() }));

function setup(width = 800, height = 600, ratio = 1) {
  vi.mocked(drawFloorPlan).mockClear();
  const target = {
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn((canvas: HTMLCanvasElement) => {
      if (!canvas.width || !canvas.height)
        throw new Error("Cannot draw a released raster buffer");
    }),
  } as unknown as CanvasRenderingContext2D;
  const buffers: HTMLCanvasElement[] = [];
  const createCanvas = () => {
    const canvas = { width: 0, height: 0, getContext: () => ({}) };
    buffers.push(canvas as unknown as HTMLCanvasElement);
    return canvas as unknown as HTMLCanvasElement;
  };
  const bounds = { min: { x: 0, y: 0 }, max: { x: 100, y: 80 } };
  const drawing = {} as ReturnType<typeof styleFloorPlan>;
  const raster = new FloorPlanRaster(target, bounds, drawing, createCanvas);
  raster.resize(width, height, ratio);
  const view = fitPlan(bounds as FloorPlanDrawing["bounds"], width, height);
  return { raster, target, buffers, view, drawing };
}

describe("floor plan gesture raster", () => {
  it("reuses one overview for the initial fit and draws no vectors during gestures", () => {
    const { raster, target, buffers, view } = setup();
    raster.draw(view, false);
    expect(drawFloorPlan).toHaveBeenCalledTimes(2);
    expect(buffers).toHaveLength(1);
    for (let i = 1; i <= 100; i++)
      raster.draw(
        { x: view.x + i, y: view.y - i, scale: view.scale * 2 },
        true,
      );
    expect(drawFloorPlan).toHaveBeenCalledTimes(2);
    expect(buffers).toHaveLength(1);
    const snapshot = buffers[0];
    expect(target.drawImage).toHaveBeenLastCalledWith(
      snapshot,
      view.x + 100 - (view.x + 160) * 2,
      view.y - 100 - (view.y + 160) * 2,
      snapshot.width * 2,
      snapshot.height * 2,
    );
  });

  it("refreshes detail after the gesture and reuses its buffer on later gestures", () => {
    const { raster, buffers, view } = setup();
    raster.draw(view, false);
    const moved = { ...view, x: view.x + 1000 };
    raster.draw(moved, true);
    expect(drawFloorPlan).toHaveBeenCalledTimes(2);
    raster.draw(moved, false);
    expect(drawFloorPlan).toHaveBeenCalledTimes(4);
    expect(buffers).toHaveLength(2);
    raster.draw({ ...moved, scale: moved.scale * 2 }, true);
    expect(drawFloorPlan).toHaveBeenCalledTimes(4);
    raster.draw({ ...moved, scale: moved.scale * 2 }, false);
    expect(drawFloorPlan).toHaveBeenCalledTimes(6);
    expect(buffers).toHaveLength(2);
  });

  it("fills areas beyond the detail with the full-plan overview", () => {
    const { raster, target, buffers, view } = setup();
    raster.draw(view, false);
    raster.draw({ ...view, scale: view.scale * 4 }, false);
    vi.mocked(target.drawImage).mockClear();
    raster.draw({ ...view, x: -2000, scale: view.scale * 4 }, true);
    expect(target.drawImage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(target.drawImage).mock.calls[0][0]).toBe(buffers[0]);
    expect(vi.mocked(target.drawImage).mock.calls[1][0]).toBe(buffers[1]);
  });

  it("invalidates both snapshots when styles or viewport dimensions change", () => {
    const { raster, buffers, view, drawing } = setup();
    raster.draw(view, false);
    raster.draw({ ...view, x: view.x + 10 }, false);
    raster.style(drawing);
    expect(buffers.every((canvas) => canvas.width === 0)).toBe(true);
    raster.draw(view, false);
    expect(drawFloorPlan).toHaveBeenCalledTimes(6);
    raster.resize(400, 300, 2);
    expect(buffers.every((canvas) => canvas.width === 0)).toBe(true);
    raster.draw(
      fitPlan({ min: { x: 0, y: 0 }, max: { x: 100, y: 80 } }, 400, 300),
      false,
    );
    expect(drawFloorPlan).toHaveBeenCalledTimes(8);
    raster.clear();
    expect(
      buffers.every((canvas) => canvas.width === 0 && canvas.height === 0),
    ).toBe(true);
  });

  it("bounds raster memory even on large high-density screens", () => {
    const { raster, buffers, view } = setup(7680, 4320, 3);
    raster.draw(view, false);
    raster.draw({ ...view, x: view.x + 10 }, false);
    expect(buffers).toHaveLength(2);
    for (const canvas of buffers)
      expect(canvas.width * canvas.height).toBeLessThanOrEqual(8_000_000);
  });
  it("redraws settled geometry at native density even when previews are capped", () => {
    const { raster, target, view, drawing } = setup(1920, 1080, 2);
    raster.draw(view, false);
    expect(drawFloorPlan).toHaveBeenLastCalledWith(
      target,
      drawing,
      view,
      1920,
      1080,
      2,
    );
    const draws = vi.mocked(drawFloorPlan).mock.calls.length;
    raster.draw({ ...view, scale: view.scale * 2 }, true);
    expect(drawFloorPlan).toHaveBeenCalledTimes(draws);
  });
});
