import { createDatabase } from "@mnemo/database";

import type { ProcessingJobHandlers } from "./application/processing-job";
import { ProcessingWorker } from "./application/processing-worker";
import { DrizzleProcessingJobQueue } from "./infrastructure/drizzle-processing-job-queue";
import { getWorkerConfig } from "./runtime-config";

async function main() {
  const config = getWorkerConfig();
  const database = createDatabase({
    connectionString: config.databaseUrl,
    maxConnections: 2,
  });
  const handlers: ProcessingJobHandlers = {};
  const worker = new ProcessingWorker(
    new DrizzleProcessingJobQueue(database.db),
    handlers,
    config,
  );
  const abortController = new AbortController();

  console.info("Mnemo processing worker is ready", {
    workerId: config.workerId,
    pollIntervalMs: config.pollIntervalMs,
    handlers: Object.keys(handlers),
  });

  if (Object.keys(handlers).length === 0) {
    console.warn(
      "No processor is registered yet; queued jobs remain untouched until an adapter is enabled.",
    );
  }

  const shutdown = (signal: NodeJS.Signals) => {
    console.info("Mnemo processing worker is stopping", { signal });
    abortController.abort();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    await worker.run(abortController.signal);
  } finally {
    await database.close();
    console.info("Mnemo processing worker stopped");
  }
}

void main().catch((error: unknown) => {
  console.error("Mnemo processing worker crashed", { error });
  process.exitCode = 1;
});
