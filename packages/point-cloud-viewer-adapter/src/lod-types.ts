import type { PointCloudChunkInput } from "@ifc-lite/renderer";

export type PointCloudLodView = {
  viewProjectionMatrix: Float32Array;
  modelMatrix: Float32Array;
  cameraPosition: [number, number, number];
  verticalFovRadians: number;
  orthographicHeight?: number;
  viewportHeight: number;
  pointBudget: number;
  pixelThreshold?: number;
};

export type PointCloudLodSwap = {
  add: Array<{ nodeId: string; chunk: PointCloudChunkInput }>;
  remove: string[];
  pointCount: number;
  nodeCount: number;
  complete: boolean;
};
