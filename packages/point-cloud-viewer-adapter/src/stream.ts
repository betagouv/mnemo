import {
  createDecodeWorkerSource,
  streamPointCloud,
  type CreateDecodeWorkerSourceOptions,
  type StreamHandle,
  type StreamPointCloudOptions,
} from "@ifc-lite/pointcloud";

import type { PointCloudFormat } from "./format";

export type PointCloudStreamOptions = Omit<
  StreamPointCloudOptions,
  "createSource" | "format"
> & {
  format: PointCloudFormat;
};

export type PointCloudStreamHandle = StreamHandle;

function spawnDecodeWorker() {
  return new Worker(
    new URL("./point-cloud-decode.worker.ts", import.meta.url),
    {
      name: "mnemo-point-cloud-decode",
    },
  );
}

function createWorkerSource(options: CreateDecodeWorkerSourceOptions) {
  return createDecodeWorkerSource({
    ...options,
    spawn: spawnDecodeWorker,
  });
}

export function createPointCloudStream(options: PointCloudStreamOptions) {
  return streamPointCloud({
    ...options,
    createSource: createWorkerSource,
  });
}
