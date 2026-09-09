import type {
  ProcessingJobHandlers,
  ProcessingJobLease,
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

export type BackgroundJobLease<JobType extends string> = {
  id: string;
  type: JobType;
  attempt: number;
  maxAttempts: number;
};

export interface BackgroundJobQueue<
  JobType extends string,
  Job extends BackgroundJobLease<JobType>,
> {
  claim(input: {
    workerId: string;
    supportedTypes: JobType[];
    claimedAt: Date;
    staleBefore: Date;
  }): Promise<Job | null>;
  complete(input: {
    job: Job;
    workerId: string;
    completedAt: Date;
  }): Promise<void>;
  fail(input: {
    job: Job;
    workerId: string;
    error: string;
    failedAt: Date;
    retryAt: Date;
  }): Promise<void>;
}

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

export class BackgroundWorker<
  JobType extends string,
  Job extends BackgroundJobLease<JobType>,
> {
  private readonly now: () => Date;
  private readonly logger: WorkerLogger;
  private readonly supportedTypes: JobType[];

  constructor(
    private readonly queue: BackgroundJobQueue<JobType, Job>,
    private readonly handlers: Partial<
      Record<JobType, (job: Job) => Promise<void>>
    >,
    private readonly options: ProcessingWorkerOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? console;
    this.supportedTypes = Object.keys(handlers) as JobType[];
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
      this.logger.warn("Background job failed", {
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
    this.logger.info("Background job completed", {
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

export class ProcessingWorker extends BackgroundWorker<
  ProcessingJobLease["type"],
  ProcessingJobLease
> {
  constructor(
    queue: ProcessingJobQueue,
    handlers: ProcessingJobHandlers,
    options: ProcessingWorkerOptions,
  ) {
    super(queue, handlers, options);
  }
}
