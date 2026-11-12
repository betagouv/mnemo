import type { EdgeLockInput, Renderer } from "@ifc-lite/renderer";

export type MeasurementPoint = {
  point: { x: number; y: number; z: number };
  kind: "vertex" | "edge" | "surface" | "point_cloud";
};

/** Keeps IFC-Lite's magnetic edge lock local to the active measuring tool. */
export class MeasurementPicking {
  private lock: EdgeLockInput = {
    edge: null,
    meshExpressId: null,
    lockStrength: 0,
  };

  constructor(private readonly renderer: Renderer) {}

  reset() {
    this.lock = { edge: null, meshExpressId: null, lockStrength: 0 };
  }

  pick(
    x: number,
    y: number,
    magnetic: boolean,
    visibility: { hiddenIds: Set<number>; isolatedIds: Set<number> | null },
  ): MeasurementPoint | null {
    if (!magnetic) this.reset();
    const camera = this.renderer.getCamera();
    // IFC-Lite converts its pixel radius using perspective distance/FOV.
    // Compensate for the orthographic camera's independent zoom scale.
    const radiusScale =
      camera.getProjectionMode() === "orthographic"
        ? camera.getOrthoSize() /
          (camera.getDistance() * Math.tan(camera.getFOV() / 2))
        : 1;
    const options = {
      ...visibility,
      snapOptions: {
        snapToVertices: magnetic,
        snapToEdges: magnetic,
        snapToFaces: false,
        snapToPointClouds: magnetic,
        screenSnapRadius: magnetic ? 12 * radiusScale : 0,
      },
    };
    // IFC-Lite's magnetic mesh query does not filter section clipping.
    // The regular query rejects clipped intersections and snap targets.
    if (this.renderer.hasActiveClipping()) {
      this.reset();
      const result = this.renderer.raycastScene(x, y, options);
      const snap = magnetic ? result?.snap : undefined;
      return measurementPoint(
        snap?.position ?? result?.intersection.point,
        snap?.type,
      );
    }
    const result = this.renderer.raycastSceneMagnetic(x, y, this.lock, options);
    if (magnetic && result.edgeLock.shouldLock && result.edgeLock.edge) {
      this.lock = {
        edge: result.edgeLock.edge,
        meshExpressId: result.edgeLock.meshExpressId,
        lockStrength: 1,
      };
    } else if (result.edgeLock.shouldRelease) this.reset();
    const snap = magnetic ? result.snapTarget : null;
    return measurementPoint(
      snap?.position ?? result.intersection?.point,
      snap?.type,
    );
  }
}

function measurementPoint(
  point: { x: number; y: number; z: number } | undefined,
  type?: string,
): MeasurementPoint | null {
  if (!point || ![point.x, point.y, point.z].every(Number.isFinite))
    return null;
  return {
    point: { ...point },
    kind:
      type === "vertex" || type === "edge" || type === "point_cloud"
        ? type
        : "surface",
  };
}
