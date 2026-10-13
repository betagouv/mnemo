import { S3ObjectStorage } from "@mnemo/storage";

import { runRemotePointCloudJob } from "./application/run-remote-point-cloud-job";
import { remotePointCloudPrefix } from "./application/remote-point-cloud-protocol";
import { PotreeConverterProcessor } from "./infrastructure/potree-converter";
import { PotreePointCloudArtifactBuilder } from "./infrastructure/potree-point-cloud-artifact-builder";
import { getPointCloudOneOffConfig } from "./runtime-config";

async function main() {
  const config = getPointCloudOneOffConfig();
  const storage = new S3ObjectStorage({
    ...config.storage,
    publicEndpoint: config.storage.endpoint,
  });
  const startedAt = Date.now();
  console.info("Point cloud one-off started", { jobId: config.job.jobId });
  const heartbeat = setInterval(() => {
    console.info("Point cloud one-off still running", {
      jobId: config.job.jobId,
      elapsedMinutes: Math.floor((Date.now() - startedAt) / 60_000),
    });
  }, 5 * 60_000);
  heartbeat.unref();
  try {
    await runRemotePointCloudJob({
      job: config.job,
      storage,
      artifacts: new PotreePointCloudArtifactBuilder(
        storage,
        new PotreeConverterProcessor({
          executablePath: config.potreeConverterPath,
        }),
        remotePointCloudPrefix(config.job),
      ),
    });
    console.info("Point cloud one-off completed", { jobId: config.job.jobId });
  } finally {
    clearInterval(heartbeat);
  }
}

void main().catch((error: unknown) => {
  console.error("Point cloud one-off failed", { error });
  process.exitCode = 1;
});
