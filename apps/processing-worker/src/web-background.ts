import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import type { MnemoPrismaDatabase } from "@mnemo/database";
import type { ObjectStorage } from "@mnemo/storage";

import {
  createDeleteResourceHandler,
  deletionJobTypes,
  type DeletionJobLease,
  type DeletionJobType,
} from "./application/delete-resource";
import {
  createProcessRemotePointCloudAssetHandler,
  type RemotePointCloudLauncher,
} from "./application/process-remote-point-cloud-asset";
import type { ProcessingJobHandlers } from "./application/processing-job";
import {
  BackgroundWorker,
  ProcessingWorker,
} from "./application/processing-worker";
import type { RemotePointCloudJob } from "./application/remote-point-cloud-protocol";
import { LocalIfcMcpCacheCleaner } from "./infrastructure/local-ifc-mcp-cache-cleaner";
import { PrismaDeletedResourceRepository } from "./infrastructure/prisma-deleted-resource-repository";
import { PrismaDeletionJobQueue } from "./infrastructure/prisma-deletion-job-queue";
import { PrismaPointCloudProcessingRepository } from "./infrastructure/prisma-point-cloud-processing-repository";
import { PrismaProcessingJobQueue } from "./infrastructure/prisma-processing-job-queue";
import { ScalingoPointCloudJobLauncher } from "./infrastructure/scalingo-point-cloud-job-launcher";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to launch point-cloud jobs`);
  return value;
}

class LocalDockerPointCloudLauncher implements RemotePointCloudLauncher {
  async launch(job: RemotePointCloudJob) {
    const bundled = process.env.MNEMO_LOCAL_COPC_BINARY;
    const envFile = process.env.MNEMO_ENV_FILE ?? ".env.local";
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        bundled ? "node" : "docker",
        bundled
          ? [bundled]
          : [
              "compose",
              "--env-file",
              envFile,
              "run",
              "--rm",
              "--no-deps",
              "-e",
              "MNEMO_POINT_CLOUD_JOB",
              "processing-worker",
            ],
        {
          cwd: process.env.MNEMO_REPO_ROOT ?? process.cwd(),
          env: { ...process.env, MNEMO_POINT_CLOUD_JOB: JSON.stringify(job) },
          stdio: "inherit",
        },
      );
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`Local COPC one-off exited with code ${code}`)),
      );
    });
  }
}

/** Durable DB queues run inside mnemo-web; COPC conversion runs as a one-off. */
export function startWebBackgroundJobs(
  database: MnemoPrismaDatabase,
  storage: ObjectStorage,
  signal: AbortSignal,
) {
  const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const mode = process.env.POINT_CLOUD_PROCESSING_MODE ?? "local";
  const launcher: RemotePointCloudLauncher =
    mode === "scalingo"
      ? new ScalingoPointCloudJobLauncher({
          apiToken: required("SCALINGO_API_TOKEN"),
          app: required("SCALINGO_APP"),
          region: required("SCALINGO_REGION") as "osc-fr1" | "osc-secnum-fr1",
          size: process.env.SCALINGO_ONE_OFF_SIZE ?? "M",
        })
      : new LocalDockerPointCloudLauncher();
  if (mode !== "local" && mode !== "scalingo")
    throw new Error("POINT_CLOUD_PROCESSING_MODE must be local or scalingo");
  const options = {
    workerId,
    pollIntervalMs: 3_000,
    leaseTimeoutMs: 15 * 60_000,
    retryBaseDelayMs: 5_000,
  };
  const pointCloud = new ProcessingWorker(
    new PrismaProcessingJobQueue(database),
    {
      process_point_cloud: createProcessRemotePointCloudAssetHandler({
        repository: new PrismaPointCloudProcessingRepository(database),
        storage,
        launcher,
        pollIntervalMs: 5_000,
        resultTimeoutMs: 4 * 60 * 60_000,
        workerId,
      }),
    } satisfies ProcessingJobHandlers,
    options,
  );
  const deletionHandler = createDeleteResourceHandler({
    resources: new PrismaDeletedResourceRepository(database),
    storage,
    ...(process.env.IFC_MCP_CACHE_DIR
      ? {
          workingCopies: new LocalIfcMcpCacheCleaner(
            process.env.IFC_MCP_CACHE_DIR,
          ),
        }
      : {}),
  });
  const deletion = new BackgroundWorker<DeletionJobType, DeletionJobLease>(
    new PrismaDeletionJobQueue(database),
    Object.fromEntries(
      deletionJobTypes.map((type) => [type, deletionHandler]),
    ) as Record<DeletionJobType, typeof deletionHandler>,
    { ...options, workerId: `${workerId}:deletion` },
  );
  return Promise.all([pointCloud.run(signal), deletion.run(signal)]);
}
