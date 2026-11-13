import type { ObjectStorage } from "@mnemo/storage";

import type { ProcessingJobHandler } from "./processing-job";
import type { PointCloudProcessingRepository } from "./process-point-cloud-asset";
import {
  remotePointCloudJobSchema,
  remotePointCloudOutcomeKey,
  remotePointCloudOutcomeSchema,
  remotePointCloudPrefix,
  remotePointCloudProgressKey,
  remotePointCloudProgressSchema,
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

    // E57 uses the existing bounded preview path, not COPC conversion.
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
    const progressKey = remotePointCloudProgressKey(job);
    let lastSequence = 0;
    const clearProgress = () =>
      input.storage.deleteObject(progressKey).catch(() => undefined);
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
          await clearProgress();
          await input.storage.deleteObject(outcomeKey).catch(() => undefined);
          throw new Error(outcome.error);
        }
        const prefix = `${remotePointCloudPrefix(job)}/`;
        const artifactKey = outcome.result.copcObjectKey;
        if (artifactKey !== `${prefix}cloud.copc.laz`) {
          throw new Error("Point-cloud result references unexpected objects");
        }
        if (!(await input.storage.statObject(artifactKey))) {
          throw new Error(`Point-cloud artifact ${artifactKey} is missing`);
        }
        const saved = await input.repository.saveResult(
          asset.id,
          outcome.result,
          now(),
          { jobId: lease.id, attempt: lease.attempt, workerId: input.workerId },
        );
        if (!saved) {
          await clearProgress();
          await Promise.allSettled([
            input.storage.deleteObject(artifactKey),
            input.storage.deleteObject(outcomeKey),
          ]);
          throw new Error(
            "Point-cloud asset was deleted or has an obsolete conversion result",
          );
        }
        await input.storage.deleteObject(outcomeKey).catch(() => undefined);
        await clearProgress();
        return;
      }
      try {
        const metadata = await input.storage.statObject(progressKey);
        if (metadata && metadata.contentLength <= 4_096) {
          const parsed = remotePointCloudProgressSchema.safeParse(
            JSON.parse(
              new TextDecoder().decode(
                await input.storage.readObject(progressKey),
              ),
            ),
          );
          if (
            parsed.success &&
            parsed.data.jobId === job.jobId &&
            parsed.data.attempt === job.attempt &&
            parsed.data.sequence > lastSequence
          ) {
            await input.repository.saveProgress(parsed.data.progress, {
              jobId: job.jobId,
              attempt: job.attempt,
              workerId: input.workerId,
            });
            lastSequence = parsed.data.sequence;
          }
        }
      } catch {
        console.warn("Point-cloud progress could not be read", {
          jobId: job.jobId,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
    }
    await clearProgress();
    throw new Error("Point-cloud one-off timed out before publishing a result");
  };
}
