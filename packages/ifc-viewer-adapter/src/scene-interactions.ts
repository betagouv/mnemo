import type { Renderer, Vec3 } from "@ifc-lite/renderer";

type SceneInteractionsHost = {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  onPick: (x: number, y: number, additive: boolean) => void;
  findOrbitCenter?: (x: number, y: number) => Promise<Vec3 | null>;
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
  private pendingOrbit: { x: number; y: number } | null = null;

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
    this.pendingOrbit = null;
    this.mode = null;
    this.pointerId = null;
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
    if (this.pointerId !== null) return;
    this.flushOrbit();

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
      !this.moved &&
      Math.abs(event.clientX - this.startX) +
        Math.abs(event.clientY - this.startY) >
        4
    ) {
      this.moved = true;
      if (this.mode === "orbit") this.startOrbit();
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
      if (!this.moved) return;
      if (this.pendingOrbit) {
        this.pendingOrbit.x += deltaX;
        this.pendingOrbit.y += deltaY;
      } else {
        camera.orbit(deltaX, deltaY, false);
      }
    }

    this.x = event.clientX;
    this.y = event.clientY;
    this.host.renderer.requestRender();
  };

  private startOrbit() {
    if (!this.host.findOrbitCenter) return;
    const bounds = this.host.canvas.getBoundingClientRect();
    const camera = this.host.renderer.getCamera();
    const viewProjection = camera.getViewProjMatrix().m.slice();
    const pending = { x: 0, y: 0 };
    this.pendingOrbit = pending;
    // Keep the camera still while picking so the hit belongs to the original
    // cursor ray. Coalesce movement instead of issuing a pick on every frame.
    void this.host
      .findOrbitCenter(this.startX - bounds.left, this.startY - bounds.top)
      .catch(() => null)
      .then((center) => {
        if (this.pendingOrbit !== pending) return;
        // Camera commands and resizes can supersede the gesture during readback.
        const currentProjection = camera.getViewProjMatrix().m;
        if (
          viewProjection.some(
            (value, index) => value !== currentProjection[index],
          )
        ) {
          this.pendingOrbit = null;
          return;
        }
        if (center) camera.setOrbitCenter(center);
        this.flushOrbit();
      });
  }

  private flushOrbit() {
    const pending = this.pendingOrbit;
    if (!pending) return;
    this.pendingOrbit = null;
    this.host.renderer.getCamera().orbit(pending.x, pending.y, false);
    this.host.renderer.requestRender();
  }

  private readonly onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;

    const shouldPick =
      event.type !== "pointercancel" &&
      event.button === 0 &&
      this.mode === "orbit" &&
      !this.moved;
    if (event.type === "pointercancel") this.pendingOrbit = null;
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
    this.flushOrbit();
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
