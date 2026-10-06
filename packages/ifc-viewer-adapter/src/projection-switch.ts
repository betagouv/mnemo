import type { Renderer } from "@ifc-lite/renderer";

type WorldPoint = { x: number; y: number; z: number };
type ProjectionMode = ReturnType<
  ReturnType<Renderer["getCamera"]>["getProjectionMode"]
>;

function rayBoxEntry(
  origin: WorldPoint,
  direction: WorldPoint,
  box: { min: WorldPoint; max: WorldPoint },
): WorldPoint | null {
  let near = -Infinity;
  let far = Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    if (Math.abs(direction[axis]) < 1e-12) {
      if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) {
        return null;
      }
      continue;
    }
    const first = (box.min[axis] - origin[axis]) / direction[axis];
    const second = (box.max[axis] - origin[axis]) / direction[axis];
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return null;
  }
  const distance = near > 0 ? near : far;
  if (!Number.isFinite(distance) || distance <= 0) return null;
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance,
  };
}

async function visibleFocusDepth(
  renderer: Renderer,
  canvas: HTMLCanvasElement,
  position: WorldPoint,
  direction: WorldPoint,
  fallbackDepth: number,
  hiddenIds: Set<number>,
  isolatedIds: Set<number> | null,
  isCurrent: () => boolean,
): Promise<number> {
  const bounds = canvas.getBoundingClientRect();
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    canvas.width <= 0 ||
    canvas.height <= 0
  )
    return fallbackDepth;

  const camera = renderer.getCamera();
  const pickOptions = { hiddenIds, isolatedIds };
  for (const [x, y] of [
    [0.5, 0.5],
    [0.4, 0.5],
    [0.6, 0.5],
    [0.5, 0.4],
    [0.5, 0.6],
  ]) {
    if (!isCurrent()) return fallbackDepth;
    const cssX = x * bounds.width;
    const cssY = y * bounds.height;
    const ray = camera.unprojectToRay(
      cssX * (canvas.width / bounds.width),
      cssY * (canvas.height / bounds.height),
      canvas.width,
      canvas.height,
    );
    // Exact hit while IFC-Lite retains CPU triangles.
    let point = renderer.raycastScene(cssX, cssY, pickOptions)?.intersection
      .point;
    if (!point) {
      // On large models IFC-Lite releases CPU triangles. Pick still finds the
      // entity; its retained bounds give us a depth along the same camera ray.
      try {
        const picked = await renderer.pick(cssX, cssY, pickOptions);
        if (!isCurrent()) return fallbackDepth;
        point = picked?.worldXYZ;
        if (!point && picked) {
          const box = renderer
            .getScene()
            .getEntityBoundingBox(picked.expressId);
          if (box)
            point = rayBoxEntry(ray.origin, ray.direction, box) ?? undefined;
        }
      } catch {
        // A lost WebGPU device can reject a pending pick. Keep the fallback.
      }
    }
    if (!point) continue;
    const depth =
      (point.x - position.x) * direction.x +
      (point.y - position.y) * direction.y +
      (point.z - position.z) * direction.z;
    if (Number.isFinite(depth) && depth > 0) return depth;
  }
  return fallbackDepth;
}

export async function switchProjectionAtVisibleSurface({
  renderer,
  canvas,
  mode,
  hiddenIds,
  isolatedIds,
  isCurrent,
}: {
  renderer: Renderer;
  canvas: HTMLCanvasElement;
  mode: ProjectionMode;
  hiddenIds: Set<number>;
  isolatedIds: Set<number> | null;
  isCurrent: () => boolean;
}): Promise<boolean> {
  const camera = renderer.getCamera();
  const previousMode = camera.getProjectionMode();
  if (previousMode === mode) return false;
  const position = { ...camera.getPosition() };
  const target = { ...camera.getTarget() };
  const previousOrthoSize = camera.getOrthoSize();
  const distance = Math.hypot(
    target.x - position.x,
    target.y - position.y,
    target.z - position.z,
  );
  const halfFovTangent = Math.tan(camera.getFOV() / 2);

  if (distance > 0 && Number.isFinite(halfFovTangent) && halfFovTangent > 0) {
    const direction = {
      x: (target.x - position.x) / distance,
      y: (target.y - position.y) / distance,
      z: (target.z - position.z) / distance,
    };
    // The camera target may be far behind the visible building. Match scale
    // at the surface in the viewport, not at that stale target plane.
    const focusDepth = await visibleFocusDepth(
      renderer,
      canvas,
      position,
      direction,
      distance,
      hiddenIds,
      isolatedIds,
      isCurrent,
    );
    if (
      !isCurrent() ||
      camera.getProjectionMode() !== previousMode ||
      camera.getOrthoSize() !== previousOrthoSize ||
      (["x", "y", "z"] as const).some(
        (axis) =>
          camera.getPosition()[axis] !== position[axis] ||
          camera.getTarget()[axis] !== target[axis],
      )
    )
      return false;

    const focus = {
      x: position.x + direction.x * focusDepth,
      y: position.y + direction.y * focusDepth,
      z: position.z + direction.z * focusDepth,
    };
    if (mode === "orthographic") {
      camera.setTarget(focus.x, focus.y, focus.z);
    } else {
      const equivalentDistance = camera.getOrthoSize() / halfFovTangent;
      if (Number.isFinite(equivalentDistance) && equivalentDistance > 0) {
        camera.setTarget(focus.x, focus.y, focus.z);
        camera.setPosition(
          focus.x - direction.x * equivalentDistance,
          focus.y - direction.y * equivalentDistance,
          focus.z - direction.z * equivalentDistance,
        );
      }
    }
  }

  if (!isCurrent()) return false;
  camera.setProjectionMode(mode);
  return true;
}
