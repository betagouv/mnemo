import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

function positiveInteger(name: string, fallback: number, minimum: number) {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);

  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${name} must be at least ${minimum}`);
  }

  return value;
}

export function getWorkerConfig() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return {
    databaseUrl,
    workerId:
      process.env.WORKER_ID ??
      `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`,
    pollIntervalMs: positiveInteger("WORKER_POLL_INTERVAL_MS", 3_000, 250),
    leaseTimeoutMs: positiveInteger(
      "WORKER_LEASE_TIMEOUT_MS",
      15 * 60 * 1_000,
      10_000,
    ),
    retryBaseDelayMs: positiveInteger("WORKER_RETRY_BASE_DELAY_MS", 5_000, 250),
  };
}
