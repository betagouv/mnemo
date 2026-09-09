import { randomUUID } from "node:crypto";

import { createDatabase, deletionJobs } from "@mnemo/database";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  DeletionJobLeaseLostError,
  DrizzleDeletionJobQueue,
} from "./drizzle-deletion-job-queue";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for worker integration tests");
}

const database = createDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const resourceIds: string[] = [];
const now = new Date("2026-09-09T14:00:00.000Z");

async function createDeletionJob(maxAttempts = 5) {
  const resourceId = randomUUID();
  resourceIds.push(resourceId);
  const [job] = await database.db
    .insert(deletionJobs)
    .values({
      resourceId,
      type: "delete_asset",
      objectKeys: [`objects/${resourceId}`],
      maxAttempts,
      availableAt: new Date("2000-01-01T00:00:00.000Z"),
    })
    .returning();

  if (!job) throw new Error("Failed to create deletion job fixture");
  return job;
}

describe("DrizzleDeletionJobQueue", () => {
  afterAll(async () => {
    for (const resourceId of resourceIds) {
      await database.db
        .delete(deletionJobs)
        .where(eq(deletionJobs.resourceId, resourceId));
    }
    await database.close();
  });

  it("marks an exhausted stale lease as failed", async () => {
    const job = await createDeletionJob(1);
    await database.db
      .update(deletionJobs)
      .set({
        status: "running",
        attempts: 1,
        lockedAt: new Date(now.getTime() - 120_000),
        lockedBy: "dead-worker",
      })
      .where(eq(deletionJobs.id, job.id));
    const queue = new DrizzleDeletionJobQueue(database.db);

    await expect(
      queue.claim({
        workerId: "replacement-worker",
        supportedTypes: ["delete_asset"],
        claimedAt: now,
        staleBefore: new Date(now.getTime() - 60_000),
      }),
    ).resolves.toBeNull();
    await expect(
      database.db
        .select({ status: deletionJobs.status })
        .from(deletionJobs)
        .where(eq(deletionJobs.id, job.id)),
    ).resolves.toEqual([{ status: "failed" }]);
  });

  it("rejects completion after ownership of the lease was lost", async () => {
    const job = await createDeletionJob();
    const queue = new DrizzleDeletionJobQueue(database.db);
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
    ).rejects.toBeInstanceOf(DeletionJobLeaseLostError);
  });
});
