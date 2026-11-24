import {
  applySpatialPlacement,
  type MeshData,
  type SpatialAffineTransform,
  type SpatialFrameOffset,
} from "@ifc-lite/geometry";
import { ifcToViewerAxes } from "@ifc-lite/geometry/world-frame";

export type ScenePlacement = {
  moves: boolean;
  place: (mesh: MeshData) => MeshData;
  /** Convert an authored elevation to the scene's vertical axis. */
  elevation: (authored: number) => number;
};

const identity: SpatialAffineTransform = {
  m00: 1,
  m01: 0,
  m02: 0,
  tx: 0,
  m10: 0,
  m11: 1,
  m12: 0,
  ty: 0,
  m20: 0,
  m21: 0,
  m22: 1,
  tz: 0,
};

function transformVectors(
  source: Float32Array,
  linear: SpatialAffineTransform,
  normalize: boolean,
) {
  const result = new Float32Array(source.length);
  for (let index = 0; index < source.length; index += 3) {
    const [x, y, z] = applySpatialPlacement(
      linear,
      source[index]!,
      source[index + 1]!,
      source[index + 2]!,
    );
    const length = normalize ? Math.hypot(x, y, z) || 1 : 1;
    result[index] = x / length;
    result[index + 1] = y / length;
    result[index + 2] = z / length;
  }
  return result;
}

/**
 * Place streamed meshes in the scene. `rtc` and `renderOrigin` are the Z-up offsets
 * removed from authored and project coordinates. Translation stays in each mesh's
 * f64 origin, so that vertices keep their f32 precision at map coordinates.
 */
export function createScenePlacement(
  alignment: SpatialAffineTransform | null,
  rtc: SpatialFrameOffset,
  renderOrigin: SpatialFrameOffset,
): ScenePlacement {
  const transform = alignment ?? identity;
  const source = ifcToViewerAxes(rtc);
  const target = ifcToViewerAxes(renderOrigin);
  const toScene = (x: number, y: number, z: number) => {
    const project = applySpatialPlacement(
      transform,
      x + source.x,
      y + source.y,
      z + source.z,
    );
    return [
      project[0] - target.x,
      project[1] - target.y,
      project[2] - target.z,
    ] as [number, number, number];
  };
  const linear = { ...transform, tx: 0, ty: 0, tz: 0 };
  const turns = (Object.keys(identity) as (keyof typeof identity)[]).some(
    (key) => Math.abs(linear[key] - identity[key]) > 1e-12,
  );
  const moves = turns || toScene(0, 0, 0).some((value) => value !== 0);
  return {
    moves,
    elevation: (authored) => toScene(0, authored - source.y, 0)[1],
    place: (mesh) =>
      moves
        ? {
            ...mesh,
            origin: toScene(...(mesh.origin ?? [0, 0, 0])),
            ...(turns
              ? {
                  positions: transformVectors(mesh.positions, linear, false),
                  normals: transformVectors(mesh.normals, linear, true),
                }
              : {}),
            // These describe the authored placement; consumers recompute them.
            geometryHash: undefined,
            geometryAabb: undefined,
            localToWorld: undefined,
          }
        : mesh,
  };
}

/** Project coordinates (Z up) that bring this model next to the scene origin. */
export function projectOrigin(
  alignment: SpatialAffineTransform | null,
  rtc: SpatialFrameOffset,
): SpatialFrameOffset {
  const { x, y, z } = ifcToViewerAxes(rtc);
  const project = applySpatialPlacement(alignment ?? identity, x, y, z);
  return { x: project[0], y: 0 - project[2], z: project[1] };
}
