import type { DecodeWorkerFormat } from "@ifc-lite/pointcloud";

const supportedPointCloudFormats = [
  "las",
  "laz",
  "ply",
  "e57",
] as const satisfies readonly DecodeWorkerFormat[];

export type PointCloudFormat = (typeof supportedPointCloudFormats)[number];

export function detectPointCloudFormat(
  fileName: string,
): PointCloudFormat | null {
  const extension = fileName.trim().toLowerCase().split(".").pop();
  return (
    supportedPointCloudFormats.find((format) => format === extension) ?? null
  );
}
