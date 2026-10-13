import type { ObjectStorage } from "@mnemo/storage";

import type { PointCloudArtifactBuilder } from "./process-point-cloud-asset";
import {
  remotePointCloudJobSchema,
  remotePointCloudOutcomeKey,
  type RemotePointCloudJob,
  type RemotePointCloudOutcome,
} from "./remote-point-cloud-protocol";

export async function runRemotePointCloudJob(input: {
  job: RemotePointCloudJob;
  storage: ObjectStorage;
  artifacts: PointCloudArtifactBuilder;
}) {
  const job = remotePointCloudJobSchema.parse(input.job);
  const outcomeKey = remotePointCloudOutcomeKey(job);
  if (await input.storage.statObject(outcomeKey)) return;

  try {
    const original = await input.storage.statObject(job.originalObjectKey);
    if (!original || original.contentLength !== job.sizeBytes) {
      throw new Error("Point-cloud original is missing or incomplete");
    }
    const result = await input.artifacts.build({
      id: job.assetId,
      projectId: job.projectId,
      originalFileName: job.originalFileName,
      originalObjectKey: job.originalObjectKey,
      sizeBytes: job.sizeBytes,
    });
    if (!result) throw new Error("Point-cloud format is not convertible");
    await writeOutcome(input.storage, outcomeKey, {
      jobId: job.jobId,
      attempt: job.attempt,
      status: "succeeded",
      result,
    });
  } catch (error) {
    await writeOutcome(input.storage, outcomeKey, {
      jobId: job.jobId,
      attempt: job.attempt,
      status: "failed",
      error:
        (error instanceof Error ? error.message : String(error)).slice(
          0,
          2_000,
        ) || "Unknown conversion error",
    });
    throw error;
  }
}

async function writeOutcome(
  storage: ObjectStorage,
  key: string,
  outcome: RemotePointCloudOutcome,
) {
  await storage.writeObject({
    objectKey: key,
    contentType: "application/json",
    body: new TextEncoder().encode(JSON.stringify(outcome)),
  });
}
