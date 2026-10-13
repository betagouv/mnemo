import type { ObjectStorage } from "@mnemo/storage";

import type { ProcessingJobHandler } from "./processing-job";
import type { PointCloudProcessingRepository } from "./process-point-cloud-asset";
import {
  remotePointCloudJobSchema,
  remotePointCloudOutcomeKey,
  remotePointCloudOutcomeSchema,
  remotePointCloudPrefix,
  type RemotePointCloudJob,
} from "./remote-point-cloud-protocol";

export interface RemotePointCloudLauncher {
  launch(job: RemotePointCloudJob): Promise<void>;
}

export function createProcessRemotePointCloudAssetHandler(input: {
  repository: PointCloudProcessingRepository;
  storage: ObjectStorage;
  launcher: RemotePointCloudLauncher;
  pollIntervalMs: number;
  resultTimeoutMs: number;
  workerId: string;
  now?: () => Date;
}): ProcessingJobHandler {
  const now = input.now ?? (() => new Date());

  return async (lease) => {
    const asset = await input.repository.findPointCloudAsset(lease.assetId);
    if (!asset)
      throw new Error(`Point-cloud asset ${lease.assetId} does not exist`);

    // E57 uses the existing bounded preview path, not Potree conversion.
    if (!/\.(?:las|laz)$/i.test(asset.originalFileName)) {
      const original = await input.storage.statObject(asset.originalObjectKey);
      if (!original || original.contentLength !== asset.sizeBytes)
        throw new Error("Point-cloud original is missing or incomplete");
      return;
    }

    const job = remotePointCloudJobSchema.parse({
      jobId: lease.id,
      attempt: lease.attempt,
      assetId: asset.id,
      projectId: asset.projectId,
      originalFileName: asset.originalFileName,
      originalObjectKey: asset.originalObjectKey,
      sizeBytes: asset.sizeBytes,
    });
    const original = await input.storage.statObject(job.originalObjectKey);
    if (!original || original.contentLength !== job.sizeBytes) {
      throw new Error("Point-cloud original is missing or incomplete");
    }

    const outcomeKey = remotePointCloudOutcomeKey(job);
    // A reclaimed attempt gets a different key, so a late previous one-off
    // cannot publish the result of the current lease.
    await input.launcher.launch(job);
    const deadline = now().getTime() + input.resultTimeoutMs;
    while (now().getTime() < deadline) {
      const stored = await input.storage.statObject(outcomeKey);
      if (stored) {
        if (stored.contentLength > 16_384) {
          throw new Error("Point-cloud result exceeds the maximum size");
        }
        const outcome = remotePointCloudOutcomeSchema.parse(
          JSON.parse(
            new TextDecoder().decode(
              await input.storage.readObject(outcomeKey),
            ),
          ) as unknown,
        );
        if (outcome.jobId !== job.jobId || outcome.attempt !== job.attempt) {
          throw new Error("Point-cloud result does not match its job attempt");
        }
        if (outcome.status === "failed") {
          await input.storage.deleteObject(outcomeKey).catch(() => undefined);
          throw new Error(outcome.error);
        }
        const prefix = `${remotePointCloudPrefix(job)}/`;
        const expected = ["metadata.json", "hierarchy.bin", "octree.bin"];
        const actual = [
          outcome.result.metadataObjectKey,
          outcome.result.hierarchyObjectKey,
          outcome.result.octreeObjectKey,
        ];
        if (
          actual.some((key, index) => key !== `${prefix}${expected[index]}`)
        ) {
          throw new Error("Point-cloud result references unexpected objects");
        }
        for (const key of actual) {
          if (!(await input.storage.statObject(key))) {
            throw new Error(`Point-cloud artifact ${key} is missing`);
          }
        }
        const saved = await input.repository.saveResult(
          asset.id,
          outcome.result,
          now(),
          { jobId: lease.id, attempt: lease.attempt, workerId: input.workerId },
        );
        if (!saved) {
          await Promise.allSettled([
            ...actual.map((key) => input.storage.deleteObject(key)),
            input.storage.deleteObject(outcomeKey),
          ]);
          throw new Error("Point-cloud asset was deleted during conversion");
        }
        await input.storage.deleteObject(outcomeKey).catch(() => undefined);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
    }
    throw new Error("Point-cloud one-off timed out before publishing a result");
  };
}
