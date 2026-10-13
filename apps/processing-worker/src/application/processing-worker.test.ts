import type { ProcessingJobType } from "@mnemo/domain/processing-job";
import { describe, expect, it, vi } from "vitest";

import type { ProcessingJobLease, ProcessingJobQueue } from "./processing-job";
import { ProcessingWorker } from "./processing-worker";

const now = new Date("2026-09-09T12:00:00.000Z");

class JobQueueStub implements ProcessingJobQueue {
  job: ProcessingJobLease | null = {
    id: "job-id",
    assetId: "asset-id",
    type: "process_point_cloud",
    attempt: 1,
    maxAttempts: 3,
  };
  claimedTypes: ProcessingJobType[] = [];
  completed: ProcessingJobLease[] = [];
  failures: Array<{ error: string; retryAt: Date }> = [];

  async claim(input: { supportedTypes: ProcessingJobType[] }) {
    this.claimedTypes = input.supportedTypes;
    return this.job;
  }

  async complete(input: { job: ProcessingJobLease }) {
    this.completed.push(input.job);
  }

  async fail(input: { job: ProcessingJobLease; error: string; retryAt: Date }) {
    this.failures.push({ error: input.error, retryAt: input.retryAt });
  }
}

function createWorker(queue: JobQueueStub, handler: () => Promise<void>) {
  return new ProcessingWorker(
    queue,
    { process_point_cloud: handler },
    {
      workerId: "test-worker",
      pollIntervalMs: 3_000,
      leaseTimeoutMs: 60_000,
      retryBaseDelayMs: 1_000,
      now: () => now,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    },
  );
}

describe("ProcessingWorker", () => {
  it("claims only registered job types and completes successful work", async () => {
    const queue = new JobQueueStub();
    const handler = vi.fn().mockResolvedValue(undefined);

    await expect(createWorker(queue, handler).runOnce()).resolves.toBe(true);

    expect(queue.claimedTypes).toEqual(["process_point_cloud"]);
    expect(handler).toHaveBeenCalledWith(queue.job);
    expect(queue.completed).toEqual([queue.job]);
    expect(queue.failures).toEqual([]);
  });

  it("releases failed work with an exponential retry date", async () => {
    const queue = new JobQueueStub();
    queue.job = { ...queue.job!, attempt: 2 };

    await expect(
      createWorker(queue, async () => {
        throw new Error("processor unavailable");
      }).runOnce(),
    ).resolves.toBe(true);

    expect(queue.completed).toEqual([]);
    expect(queue.failures).toEqual([
      {
        error: "processor unavailable",
        retryAt: new Date("2026-09-09T12:00:02.000Z"),
      },
    ]);
  });
});
