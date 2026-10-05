import { randomUUID } from "node:crypto";

import { createPrismaDatabase } from "@mnemo/database";
import { afterAll, describe, expect, it } from "vitest";

import {
  PrismaDeletionJobLeaseLostError,
  PrismaDeletionJobQueue,
} from "./prisma-deletion-job-queue";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for worker integration tests");
}

const database = createPrismaDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const resourceIds: string[] = [];
// Keep fixtures in the future so a concurrently running worker cannot lease them.
const now = new Date(Date.now() + 24 * 60 * 60 * 1_000);

async function createDeletionJob(maxAttempts = 5) {
  const resourceId = randomUUID();
  resourceIds.push(resourceId);
  const job = await database.db.deletion_jobs.create({
    data: {
      resource_id: resourceId,
      type: "delete_asset",
      object_keys: [`objects/${resourceId}`],
      max_attempts: maxAttempts,
      available_at: new Date(now.getTime() - 60_000),
    },
  });

  if (!job) throw new Error("Failed to create deletion job fixture");
  return job;
}

describe("PrismaDeletionJobQueue", () => {
  afterAll(async () => {
    for (const resourceId of resourceIds) {
      await database.db.deletion_jobs.deleteMany({
        where: { resource_id: resourceId },
      });
    }
    await database.close();
  });

  it("marks an exhausted stale lease as failed", async () => {
    const job = await createDeletionJob(1);
    await database.db.deletion_jobs.update({
      where: { id: job.id },
      data: {
        status: "running",
        attempts: 1,
        locked_at: new Date(now.getTime() - 120_000),
        locked_by: "dead-worker",
      },
    });
    const queue = new PrismaDeletionJobQueue(database.db);

    await expect(
      queue.claim({
        workerId: "replacement-worker",
        supportedTypes: ["delete_asset"],
        claimedAt: now,
        staleBefore: new Date(now.getTime() - 60_000),
      }),
    ).resolves.toBeNull();
    await expect(
      database.db.deletion_jobs.findUnique({
        where: { id: job.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "failed" });
  });

  it("rejects completion after ownership of the lease was lost", async () => {
    const job = await createDeletionJob();
    const queue = new PrismaDeletionJobQueue(database.db);
    const lease = await queue.claim({
      workerId: "worker-a",
      supportedTypes: ["delete_asset"],
      claimedAt: now,
      staleBefore: new Date(now.getTime() - 60_000),
    });

    expect(lease?.id).toBe(job.id);
    await expect(
      queue.complete({
        job: lease!,
        workerId: "worker-b",
        completedAt: now,
      }),
    ).rejects.toBeInstanceOf(PrismaDeletionJobLeaseLostError);
  });
});
