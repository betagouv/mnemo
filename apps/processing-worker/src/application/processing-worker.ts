import type { ProcessingJobType } from "@mnemo/domain/processing-job";

import type {
  ProcessingJobHandlers,
  ProcessingJobQueue,
} from "./processing-job";

export type WorkerLogger = Pick<Console, "error" | "info" | "warn">;

export type ProcessingWorkerOptions = {
  workerId: string;
  pollIntervalMs: number;
  leaseTimeoutMs: number;
  retryBaseDelayMs: number;
  now?: () => Date;
  logger?: WorkerLogger;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export class ProcessingWorker {
  private readonly now: () => Date;
  private readonly logger: WorkerLogger;
  private readonly supportedTypes: ProcessingJobType[];

  constructor(
    private readonly queue: ProcessingJobQueue,
    private readonly handlers: ProcessingJobHandlers,
    private readonly options: ProcessingWorkerOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? console;
    this.supportedTypes = Object.keys(handlers) as ProcessingJobType[];
  }

  async runOnce() {
    const claimedAt = this.now();
    const job = await this.queue.claim({
      workerId: this.options.workerId,
      supportedTypes: this.supportedTypes,
      claimedAt,
      staleBefore: new Date(claimedAt.getTime() - this.options.leaseTimeoutMs),
    });

    if (!job) {
      return false;
    }

    const handler = this.handlers[job.type];

    if (!handler) {
      throw new Error(`No handler registered for ${job.type}`);
    }

    try {
      await handler(job);
    } catch (error) {
      const failedAt = this.now();
      const delay =
        this.options.retryBaseDelayMs * Math.pow(2, job.attempt - 1);
      const message = errorMessage(error);

      await this.queue.fail({
        job,
        workerId: this.options.workerId,
        error: message,
        failedAt,
        retryAt: new Date(failedAt.getTime() + delay),
      });
      this.logger.warn("Processing job failed", {
        jobId: job.id,
        type: job.type,
        attempt: job.attempt,
        error: message,
      });
      return true;
    }

    await this.queue.complete({
      job,
      workerId: this.options.workerId,
      completedAt: this.now(),
    });
    this.logger.info("Processing job completed", {
      jobId: job.id,
      type: job.type,
      attempt: job.attempt,
    });

    return true;
  }

  async run(signal: AbortSignal) {
    while (!signal.aborted) {
      try {
        const processedJob = await this.runOnce();

        if (processedJob) {
          continue;
        }
      } catch (error) {
        this.logger.error("Processing worker polling failed", {
          error: errorMessage(error),
        });
      }

      await wait(this.options.pollIntervalMs, signal);
    }
  }
}
