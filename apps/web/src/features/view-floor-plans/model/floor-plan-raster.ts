import type { FloorPlanDrawing } from "@mnemo/ifc-viewer-adapter";
import { fitPlan, type PlanTransform } from "./floor-plan-navigation";
import { drawFloorPlan, type styleFloorPlan } from "./floor-plan-renderer";

type StyledPlan = ReturnType<typeof styleFloorPlan>;
type Snapshot = {
  canvas: HTMLCanvasElement;
  view: PlanTransform;
  margin: number;
  ratio: number;
};

// At most two raster buffers, each bounded to 32 MB of RGBA pixels.
const maxPixels = 8_000_000;
const margin = 160;

/** Reuse raster snapshots during gestures, retaining vectors for settled rendering. */
export class FloorPlanRaster {
  private overview: Snapshot | null = null;
  private detail: Snapshot | null = null;
  private width = 0;
  private height = 0;
  private ratio = 1;

  constructor(
    private readonly target: CanvasRenderingContext2D,
    private readonly bounds: FloorPlanDrawing["bounds"],
    private drawing: StyledPlan,
    private readonly createCanvas = () => document.createElement("canvas"),
  ) {}

  resize(width: number, height: number, ratio: number) {
    this.clear();
    this.width = width;
    this.height = height;
    this.ratio = ratio;
  }

  style(drawing: StyledPlan) {
    this.clear();
    this.drawing = drawing;
  }

  draw(view: PlanTransform, preview: boolean) {
    if (!this.width || !this.height) return;
    // The overview fills newly exposed regions when a gesture leaves the detail cache.
    this.overview ??= this.capture(
      fitPlan(this.bounds, this.width, this.height),
    );
    if (!preview) {
      const previous = this.detail;
      const overviewView = this.overview.view;
      this.detail =
        view.x === overviewView.x &&
        view.y === overviewView.y &&
        view.scale === overviewView.scale
          ? this.overview
          : this.capture(
              view,
              previous === this.overview ? undefined : previous,
            );
      // A refreshed snapshot can still own the previous canvas buffer.
      if (
        previous &&
        previous.canvas !== this.overview.canvas &&
        previous.canvas !== this.detail.canvas
      )
        this.release(previous);
      // Raster limits apply only to gesture previews, never to the settled drawing.
      drawFloorPlan(
        this.target,
        this.drawing,
        view,
        this.width,
        this.height,
        this.ratio,
      );
      return;
    }
    const ctx = this.target;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, this.width, this.height);
    this.blit(this.overview, view);
    if (this.detail && this.detail !== this.overview)
      this.blit(this.detail, view);
  }

  clear() {
    if (this.detail && this.detail !== this.overview) this.release(this.detail);
    if (this.overview) this.release(this.overview);
    this.overview = null;
    this.detail = null;
  }

  private capture(view: PlanTransform, previous?: Snapshot | null): Snapshot {
    const canvas = previous?.canvas ?? this.createCanvas();
    const width = this.width + margin * 2;
    const height = this.height + margin * 2;
    const ratio = Math.min(this.ratio, Math.sqrt(maxPixels / (width * height)));
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const context = canvas.getContext("2d")!;
    drawFloorPlan(
      context,
      this.drawing,
      { x: view.x + margin, y: view.y + margin, scale: view.scale },
      width,
      height,
      ratio,
    );
    return { canvas, view: { ...view }, margin, ratio };
  }

  private blit(snapshot: Snapshot, view: PlanTransform) {
    const scale = view.scale / snapshot.view.scale;
    this.target.drawImage(
      snapshot.canvas,
      view.x - (snapshot.view.x + snapshot.margin) * scale,
      view.y - (snapshot.view.y + snapshot.margin) * scale,
      (snapshot.canvas.width / snapshot.ratio) * scale,
      (snapshot.canvas.height / snapshot.ratio) * scale,
    );
  }

  private release(snapshot: Snapshot) {
    snapshot.canvas.width = 0;
    snapshot.canvas.height = 0;
  }
}
