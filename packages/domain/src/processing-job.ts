import type { AssetKind } from "./asset";

export const processingJobTypes = [
  "process_ifc",
  "process_point_cloud",
] as const;
export type ProcessingJobType = (typeof processingJobTypes)[number];

export const processingJobStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export type ProcessingJobStatus = (typeof processingJobStatuses)[number];

export function processingJobTypeForAsset(kind: AssetKind): ProcessingJobType {
  return kind === "ifc" ? "process_ifc" : "process_point_cloud";
}
