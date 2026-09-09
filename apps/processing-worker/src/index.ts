const pollIntervalMs = Number.parseInt(
  process.env.WORKER_POLL_INTERVAL_MS ?? "3000",
  10,
);

if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 250) {
  throw new Error("WORKER_POLL_INTERVAL_MS must be at least 250 milliseconds");
}

console.info("Mnemo processing worker is ready", { pollIntervalMs });

const heartbeat = setInterval(() => {
  // Job polling is introduced with the processing-jobs feature.
}, pollIntervalMs);

const shutdown = (signal: NodeJS.Signals) => {
  clearInterval(heartbeat);
  console.info("Mnemo processing worker stopped", { signal });
  process.exitCode = 0;
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
