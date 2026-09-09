import type { PotreeNode, Vec3Tuple } from "./potree-v2";

export type PointCloudLodView = {
  viewProjectionMatrix: Float32Array;
  modelMatrix: Float32Array;
  cameraPosition: Vec3Tuple;
  verticalFovRadians: number;
  orthographicHeight?: number;
  viewportHeight: number;
  pointBudget: number;
  pixelThreshold?: number;
};

export type PointCloudLodSelection = {
  nodes: PotreeNode[];
  hierarchyPages: PotreeNode[];
  pointCount: number;
};

function transformPoint(
  matrix: Float32Array,
  point: Vec3Tuple,
): [number, number, number, number] {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15],
  ];
}

function corners(node: PotreeNode): Vec3Tuple[] {
  const { min, max } = node.bounds;
  const result: Vec3Tuple[] = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) result.push([x, y, z]);
    }
  }
  return result;
}

function worldCorners(node: PotreeNode, model: Float32Array) {
  return corners(node).map((corner) => {
    const transformed = transformPoint(model, corner);
    return transformed.slice(0, 3) as Vec3Tuple;
  });
}

export function octreeNodeIntersectsView(
  node: PotreeNode,
  viewProjection: Float32Array,
  model: Float32Array,
) {
  if (viewProjection.length !== 16 || model.length !== 16) return true;
  const clipCorners = worldCorners(node, model).map((corner) =>
    transformPoint(viewProjection, corner),
  );
  const outside = [
    (clip: number[]) => clip[0] < -clip[3],
    (clip: number[]) => clip[0] > clip[3],
    (clip: number[]) => clip[1] < -clip[3],
    (clip: number[]) => clip[1] > clip[3],
    (clip: number[]) => clip[2] < 0,
    (clip: number[]) => clip[2] > clip[3],
  ];
  return !outside.some((test) => clipCorners.every(test));
}

function projectedSpacing(node: PotreeNode, view: PointCloudLodView) {
  const points = worldCorners(node, view.modelMatrix);
  const center = points.reduce<Vec3Tuple>(
    (sum, point) => [
      sum[0] + point[0] / points.length,
      sum[1] + point[1] / points.length,
      sum[2] + point[2] / points.length,
    ],
    [0, 0, 0],
  );
  const radius = Math.max(
    ...points.map((point) =>
      Math.hypot(
        point[0] - center[0],
        point[1] - center[1],
        point[2] - center[2],
      ),
    ),
  );
  const centerDistance = Math.hypot(
    center[0] - view.cameraPosition[0],
    center[1] - view.cameraPosition[1],
    center[2] - view.cameraPosition[2],
  );
  const distance = Math.max(centerDistance - radius, node.spacing, 0.001);
  const worldScale =
    Math.max(
      Math.hypot(view.modelMatrix[0], view.modelMatrix[1], view.modelMatrix[2]),
      Math.hypot(view.modelMatrix[4], view.modelMatrix[5], view.modelMatrix[6]),
      Math.hypot(
        view.modelMatrix[8],
        view.modelMatrix[9],
        view.modelMatrix[10],
      ),
    ) || 1;
  if (view.orthographicHeight && view.orthographicHeight > 0) {
    return (
      (node.spacing * worldScale * view.viewportHeight) /
      view.orthographicHeight
    );
  }
  const focalPixels =
    view.viewportHeight / (2 * Math.tan(view.verticalFovRadians / 2));
  return (node.spacing * worldScale * focalPixels) / distance;
}

export function selectPointCloudLod(
  root: PotreeNode,
  view: PointCloudLodView,
): PointCloudLodSelection {
  if (root.nodeType === 2) {
    return { nodes: [], hierarchyPages: [root], pointCount: 0 };
  }
  if (
    !octreeNodeIntersectsView(root, view.viewProjectionMatrix, view.modelMatrix)
  ) {
    return { nodes: [], hierarchyPages: [], pointCount: 0 };
  }

  const selected: PotreeNode[] = [];
  const hierarchyPages = new Map<string, PotreeNode>();
  const queue = [root];
  let pointCount = 0;
  const budget = Math.max(root.numPoints, Math.floor(view.pointBudget));
  const threshold = Math.max(0.25, view.pixelThreshold ?? 1.5);

  while (queue.length) {
    queue.sort(
      (left, right) =>
        projectedSpacing(right, view) - projectedSpacing(left, view),
    );
    const candidate = queue.shift() as PotreeNode;
    if (
      !octreeNodeIntersectsView(
        candidate,
        view.viewProjectionMatrix,
        view.modelMatrix,
      )
    ) {
      continue;
    }

    if (candidate.nodeType === 2) {
      hierarchyPages.set(candidate.name, candidate);
      continue;
    }

    if (candidate.numPoints > 0) {
      if (selected.length > 0 && pointCount + candidate.numPoints > budget) {
        continue;
      }
      selected.push(candidate);
      pointCount += candidate.numPoints;
    }

    // Potree levels are additive samples: child records contain the detail
    // that is absent from their ancestors. Keep the ancestors resident while
    // the camera asks for finer levels; substituting children creates holes.
    if (projectedSpacing(candidate, view) <= threshold) {
      continue;
    }

    for (const child of candidate.children) {
      if (
        child &&
        (child.nodeType === 2 ||
          child.numPoints > 0 ||
          child.children.some(Boolean))
      ) {
        queue.push(child);
      }
    }
  }

  return {
    nodes: selected,
    hierarchyPages: [...hierarchyPages.values()],
    pointCount,
  };
}
