import "server-only";

import { startWebBackgroundJobs } from "@mnemo/processing-worker/web-background";

import { getRuntimePrismaDatabase } from "./server/database/runtime-database";
import { getRuntimeObjectStorage } from "./server/storage/runtime-object-storage";

const singleton = globalThis as typeof globalThis & {
  mnemoBackgroundJobsStarted?: boolean;
};

export function startBackgroundJobs() {
  if (
    singleton.mnemoBackgroundJobsStarted ||
    process.env.MNEMO_BACKGROUND_JOBS !== "1" ||
    process.env.NEXT_PHASE === "phase-production-build"
  )
    return;
  singleton.mnemoBackgroundJobsStarted = true;
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  void startWebBackgroundJobs(
    getRuntimePrismaDatabase(),
    getRuntimeObjectStorage(),
    controller.signal,
  ).catch((error) => console.error("Mnemo background jobs stopped", error));
}
