import type { Renderer } from "@ifc-lite/renderer";

type SceneInteractionsHost = {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  onPick: (x: number, y: number, additive: boolean) => void;
  getCursor?: () => string;
};

/** Owns canvas gestures; BIM selection is delegated to the scene controller. */
export class SceneInteractions {
  private mode: "orbit" | "pan" | null = null;
  private pointerId: number | null = null;
  private moved = false;
  private startX = 0;
  private startY = 0;
  private x = 0;
  private y = 0;

  constructor(private readonly host: SceneInteractionsHost) {}

  get isInteracting() {
    return this.mode !== null;
  }

  attach() {
    const { canvas } = this.host;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  detach() {
    const { canvas } = this.host;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerUp);
    canvas.removeEventListener("wheel", this.onWheel);
    canvas.removeEventListener("contextmenu", this.onContextMenu);
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;

    this.pointerId = event.pointerId;
    this.mode =
      event.button === 1 || event.button === 2 || event.shiftKey
        ? "pan"
        : "orbit";
    this.x = event.clientX;
    this.y = event.clientY;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.moved = false;
    this.host.canvas.setPointerCapture(event.pointerId);
    this.host.canvas.style.cursor = "grabbing";
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.mode || event.pointerId !== this.pointerId) return;

    const deltaX = event.clientX - this.x;
    const deltaY = event.clientY - this.y;
    if (
      Math.abs(event.clientX - this.startX) +
        Math.abs(event.clientY - this.startY) >
      4
    ) {
      this.moved = true;
    }
    const camera = this.host.renderer.getCamera();
    if (this.mode === "pan") {
      let panScale = 1;
      if (camera.getProjectionMode() === "orthographic") {
        // IFC-Lite bases pan speed on camera distance, but orthographic zoom
        // changes only orthoSize. Match the speed to the visible scale.
        const referenceSize =
          camera.getDistance() * Math.tan(camera.getFOV() / 2);
        const scale = camera.getOrthoSize() / referenceSize;
        if (Number.isFinite(scale) && scale > 0) panScale = scale;
      }
      camera.pan(deltaX * panScale, deltaY * panScale, false);
    } else {
      camera.orbit(deltaX, deltaY, false);
    }

    this.x = event.clientX;
    this.y = event.clientY;
    this.host.renderer.requestRender();
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;

    const shouldPick =
      event.type !== "pointercancel" &&
      event.button === 0 &&
      this.mode === "orbit" &&
      !this.moved;
    if (this.host.canvas.hasPointerCapture(event.pointerId)) {
      this.host.canvas.releasePointerCapture(event.pointerId);
    }
    this.pointerId = null;
    this.mode = null;
    this.host.canvas.style.cursor = this.host.getCursor?.() ?? "grab";
    this.host.renderer.requestRender();

    if (shouldPick) {
      const bounds = this.host.canvas.getBoundingClientRect();
      this.host.onPick(
        event.clientX - bounds.left,
        event.clientY - bounds.top,
        event.ctrlKey || event.metaKey,
      );
    }
  };

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const bounds = this.host.canvas.getBoundingClientRect();
    this.host.renderer.getCamera().zoom(
      event.deltaY,
      false,
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      // Cursor coordinates and viewport dimensions must share CSS pixels.
      // The GPU drawing buffer can be larger on HiDPI displays.
      bounds.width,
      bounds.height,
      event.shiftKey,
    );
    this.host.renderer.requestRender();
  };

  private readonly onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };
}
