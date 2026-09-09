import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

function positiveInteger(name: string, fallback: number, minimum: number) {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);

  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${name} must be at least ${minimum}`);
  }

  return value;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function getWorkerConfig() {
  return {
    databaseUrl: required("DATABASE_URL"),
    ifcLiteServerUrl: required("IFC_LITE_SERVER_URL"),
    storage: {
      endpoint: required("S3_ENDPOINT"),
      region: required("S3_REGION"),
      bucket: required("S3_BUCKET"),
      accessKeyId: required("S3_ACCESS_KEY"),
      secretAccessKey: required("S3_SECRET_KEY"),
    },
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
