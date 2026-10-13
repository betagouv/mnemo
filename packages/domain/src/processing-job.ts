export const processingJobTypes = ["process_point_cloud"] as const;
export type ProcessingJobType = (typeof processingJobTypes)[number];

export const processingJobStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export type ProcessingJobStatus = (typeof processingJobStatuses)[number];
