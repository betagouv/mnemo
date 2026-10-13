import { z } from "zod";

const uuid = z.uuid();

export const remotePointCloudJobSchema = z.strictObject({
  jobId: uuid,
  attempt: z.number().int().positive(),
  assetId: uuid,
  projectId: uuid,
  originalFileName: z
    .string()
    .min(1)
    .max(512)
    .regex(/\.(?:las|laz)$/i),
  originalObjectKey: z.string().min(1),
  sizeBytes: z.number().int().positive().safe(),
  targetFormat: z.enum(["potree-v2", "copc-v1"]).default("potree-v2"),
});

export type RemotePointCloudJob = z.infer<typeof remotePointCloudJobSchema>;

const resultBase = {
  processor: z.string().min(1),
  processorVersion: z.string().min(1),
  pointCount: z.number().int().nonnegative().safe(),
  spacing: z.number().positive().finite(),
};

const pointCloudResultSchema = z.discriminatedUnion("format", [z.strictObject({
  format: z.literal("potree-v2"),
  ...resultBase,
  metadataObjectKey: z.string().min(1),
  hierarchyObjectKey: z.string().min(1),
  octreeObjectKey: z.string().min(1),
}), z.strictObject({
  format: z.literal("copc-v1"),
  ...resultBase,
  copcObjectKey: z.string().min(1),
})]);

export const remotePointCloudOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    jobId: uuid,
    attempt: z.number().int().positive(),
    status: z.literal("succeeded"),
    result: pointCloudResultSchema,
  }),
  z.strictObject({
    jobId: uuid,
    attempt: z.number().int().positive(),
    status: z.literal("failed"),
    error: z.string().min(1).max(2_000),
  }),
]);

export type RemotePointCloudOutcome = z.infer<
  typeof remotePointCloudOutcomeSchema
>;

export function remotePointCloudPrefix(job: RemotePointCloudJob) {
  return `projects/${job.projectId}/assets/${job.assetId}/derived/${job.targetFormat}/attempts/${job.jobId}-${job.attempt}`;
}

export function remotePointCloudOutcomeKey(job: RemotePointCloudJob) {
  return `${remotePointCloudPrefix(job)}/result.json`;
}
