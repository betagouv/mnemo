import { createPrismaDatabase } from "@mnemo/database";
import { S3ObjectStorage } from "@mnemo/storage";

import { createProcessIfcAssetHandler } from "./application/process-ifc-asset";
import { createProcessPointCloudAssetHandler } from "./application/process-point-cloud-asset";
import {
  createDeleteResourceHandler,
  deletionJobTypes,
  type DeletionJobLease,
  type DeletionJobType,
} from "./application/delete-resource";
import type { ProcessingJobHandlers } from "./application/processing-job";
import {
  BackgroundWorker,
  ProcessingWorker,
} from "./application/processing-worker";
import { PrismaDeletedResourceRepository } from "./infrastructure/prisma-deleted-resource-repository";
import { PrismaDeletionJobQueue } from "./infrastructure/prisma-deletion-job-queue";
import { PrismaProcessingJobQueue } from "./infrastructure/prisma-processing-job-queue";
import { PrismaIfcProcessingRepository } from "./infrastructure/prisma-ifc-processing-repository";
import { PrismaPointCloudProcessingRepository } from "./infrastructure/prisma-point-cloud-processing-repository";
import { LocalIfcMcpCacheCleaner } from "./infrastructure/local-ifc-mcp-cache-cleaner";
import { IfcLiteServerProcessor } from "./infrastructure/ifc-lite-server-processor";
import { PotreeConverterProcessor } from "./infrastructure/potree-converter";
import { PotreePointCloudArtifactBuilder } from "./infrastructure/potree-point-cloud-artifact-builder";
import { getWorkerConfig } from "./runtime-config";

async function main() {
  const config = getWorkerConfig();
  const database = createPrismaDatabase({
    connectionString: config.databaseUrl,
    maxConnections: 2,
  });
  const storage = new S3ObjectStorage({
    ...config.storage,
    publicEndpoint: config.storage.endpoint,
  });
  const handlers: ProcessingJobHandlers = {
    process_ifc: createProcessIfcAssetHandler({
      repository: new PrismaIfcProcessingRepository(database.db),
      storage,
      processor: new IfcLiteServerProcessor(config.ifcLiteServerUrl),
    }),
    process_point_cloud: createProcessPointCloudAssetHandler({
      repository: new PrismaPointCloudProcessingRepository(database.db),
      storage,
      artifacts: new PotreePointCloudArtifactBuilder(
        storage,
        new PotreeConverterProcessor({
          executablePath: config.potreeConverterPath,
        }),
      ),
    }),
  };
  const worker = new ProcessingWorker(
    new PrismaProcessingJobQueue(database.db),
    handlers,
    config,
  );
  const deletionHandler = createDeleteResourceHandler({
    resources: new PrismaDeletedResourceRepository(database.db),
    storage,
    workingCopies: new LocalIfcMcpCacheCleaner(config.ifcMcpCacheDirectory),
  });
  const deletionWorker = new BackgroundWorker<
    DeletionJobType,
    DeletionJobLease
  >(
    new PrismaDeletionJobQueue(database.db),
    Object.fromEntries(
      deletionJobTypes.map((type) => [type, deletionHandler]),
    ) as Record<DeletionJobType, typeof deletionHandler>,
    { ...config, workerId: `${config.workerId}:deletion` },
  );
  const abortController = new AbortController();

  console.info("Mnemo processing worker is ready", {
    workerId: config.workerId,
    pollIntervalMs: config.pollIntervalMs,
    handlers: Object.keys(handlers),
  });

  const shutdown = (signal: NodeJS.Signals) => {
    console.info("Mnemo processing worker is stopping", { signal });
    abortController.abort();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    await Promise.all([
      worker.run(abortController.signal),
      deletionWorker.run(abortController.signal),
    ]);
  } finally {
    await database.close();
    console.info("Mnemo processing worker stopped");
  }
}

void main().catch((error: unknown) => {
  console.error("Mnemo processing worker crashed", { error });
  process.exitCode = 1;
});
