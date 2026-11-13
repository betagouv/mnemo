import { randomUUID } from "node:crypto";

import { createPrismaDatabase } from "@mnemo/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaPointCloudProcessingRepository } from "./prisma-point-cloud-processing-repository";
import { PrismaProcessingJobQueue } from "./prisma-processing-job-queue";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for worker integration tests");
}

const database = createPrismaDatabase({
  connectionString: databaseUrl,
  maxConnections: 4,
});
const actorId = randomUUID();
const projectId = randomUUID();
// Keep fixtures in the future so a concurrently running worker cannot lease them.
const now = new Date(Date.now() + 24 * 60 * 60 * 1_000);
const availableAt = new Date(now.getTime() - 60_000);

async function createQueuedJob(maxAttempts = 3) {
  const assetId = randomUUID();
  const extension = "laz";
  const asset = await database.db.assets.create({
    data: {
      id: assetId,
      project_id: projectId,
      kind: "point_cloud",
      original_file_name: `fixture.${extension}`,
      media_type: "application/octet-stream",
      size_bytes: 42n,
      original_object_key: `projects/${projectId}/assets/${assetId}/original.${extension}`,
      status: "uploaded",
      created_by: actorId,
      upload_expires_at: new Date("2030-01-01T00:00:00.000Z"),
      uploaded_at: now,
    },
  });
  const job = await database.db.processing_jobs.create({
    data: {
      asset_id: assetId,
      type: "process_point_cloud",
      max_attempts: maxAttempts,
      available_at: availableAt,
      created_at: availableAt,
      updated_at: availableAt,
    },
  });

  if (!asset || !job) {
    throw new Error("Failed to create worker test fixture");
  }

  return { asset, job };
}

describe("PrismaProcessingJobQueue", () => {
  beforeAll(async () => {
    await database.db.users.create({
      data: {
        id: actorId,
        email: `${actorId}@test.mnemo.local`,
        display_name: "Worker queue actor",
      },
    });
    await database.db.projects.create({
      data: {
        id: projectId,
        title: "Worker queue project",
        created_by: actorId,
        project_members: { create: { user_id: actorId, role: "owner" } },
      },
    });
  });

  afterAll(async () => {
    await database.db.projects.deleteMany({ where: { id: projectId } });
    await database.db.users.deleteMany({ where: { id: actorId } });
    await database.close();
  });

  it("leases one job per worker and completes the related asset", async () => {
    const firstFixture = await createQueuedJob();
    const pointCloudFixture = await createQueuedJob();
    const queue = new PrismaProcessingJobQueue(database.db);

    const leases = await Promise.all([
      queue.claim({
        workerId: "worker-a",
        supportedTypes: ["process_point_cloud"],
        claimedAt: now,
        staleBefore: new Date(now.getTime() - 60_000),
      }),
      queue.claim({
        workerId: "worker-b",
        supportedTypes: ["process_point_cloud"],
        claimedAt: now,
        staleBefore: new Date(now.getTime() - 60_000),
      }),
    ]);

    expect(leases.every(Boolean)).toBe(true);
    expect(new Set(leases.map((lease) => lease?.id))).toEqual(
      new Set([firstFixture.job.id, pointCloudFixture.job.id]),
    );

    const firstLease = leases[0]!;
    await queue.complete({
      job: firstLease,
      workerId: "worker-a",
      completedAt: now,
    });

    await expect(
      database.db.processing_jobs.findUnique({
        where: { id: firstLease.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "succeeded" });
    await expect(
      database.db.assets.findUnique({
        where: { id: firstLease.assetId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "ready" });
  });

  it("marks both job and asset failed after the last attempt", async () => {
    const fixture = await createQueuedJob(1);
    const queue = new PrismaProcessingJobQueue(database.db);
    const lease = await queue.claim({
      workerId: "worker-failure",
      supportedTypes: ["process_point_cloud"],
      claimedAt: now,
      staleBefore: new Date(now.getTime() - 60_000),
    });

    expect(lease?.id).toBe(fixture.job.id);
    await queue.fail({
      job: lease!,
      workerId: "worker-failure",
      error: "converter failed",
      failedAt: now,
      retryAt: new Date(now.getTime() + 5_000),
    });

    await expect(
      database.db.processing_jobs.findUnique({
        where: { id: fixture.job.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "failed" });
    await expect(
      database.db.assets.findUnique({
        where: { id: fixture.asset.id },
        select: { status: true, error_message: true },
      }),
    ).resolves.toEqual({ status: "failed", error_message: "converter failed" });
  });

  it("reclaims a lease left behind by a crashed worker", async () => {
    const fixture = await createQueuedJob();
    const staleLock = new Date(now.getTime() - 120_000);
    await database.db.processing_jobs.update({
      where: { id: fixture.job.id },
      data: {
        status: "running",
        attempts: 1,
        locked_at: staleLock,
        locked_by: "dead-worker",
      },
    });
    const queue = new PrismaProcessingJobQueue(database.db);

    const lease = await queue.claim({
      workerId: "replacement-worker",
      supportedTypes: ["process_point_cloud"],
      claimedAt: now,
      staleBefore: new Date(now.getTime() - 60_000),
    });

    expect(lease).toMatchObject({
      id: fixture.job.id,
      attempt: 2,
    });
    await expect(
      database.db.processing_jobs.findUnique({
        where: { id: fixture.job.id },
        select: { locked_by: true },
      }),
    ).resolves.toEqual({ locked_by: "replacement-worker" });
  });

  it("does not claim or revive an asset that is being deleted", async () => {
    const fixture = await createQueuedJob();
    await database.db.assets.update({
      where: { id: fixture.asset.id },
      data: { status: "deleting" },
    });
    const queue = new PrismaProcessingJobQueue(database.db);

    await expect(
      queue.claim({
        workerId: "worker-deletion-race",
        supportedTypes: ["process_point_cloud"],
        claimedAt: now,
        staleBefore: new Date(now.getTime() - 60_000),
      }),
    ).resolves.toBeNull();

    await expect(
      database.db.assets.findUnique({
        where: { id: fixture.asset.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "deleting" });
  });
  it("guards progress by lease attempt and ownership and resets it on retry and completion", async () => {
    const fixture = await createQueuedJob();
    const queue = new PrismaProcessingJobQueue(database.db);
    const repository = new PrismaPointCloudProcessingRepository(database.db);
    const lease = await queue.claim({
      workerId: "progress-worker",
      supportedTypes: ["process_point_cloud"],
      claimedAt: now,
      staleBefore: new Date(now.getTime() - 60000),
    });
    expect(lease?.assetId).toBe(fixture.asset.id);
    const current = {
      jobId: lease!.id,
      attempt: lease!.attempt,
      workerId: "progress-worker",
    };
    const progress = {
      phase: "converting" as const,
      percent: 42,
      updatedAt: now.toISOString(),
    };
    expect(
      await repository.saveProgress(progress, { ...current, attempt: 0 }),
    ).toBe(false);
    expect(
      await repository.saveProgress(progress, {
        ...current,
        workerId: "other",
      }),
    ).toBe(false);
    expect(await repository.saveProgress(progress, current)).toBe(true);
    expect(
      (
        await database.db.processing_jobs.findUniqueOrThrow({
          where: { id: lease!.id },
        })
      ).progress,
    ).toEqual(progress);
    await queue.fail({
      job: lease!,
      workerId: current.workerId,
      error: "retry",
      failedAt: now,
      retryAt: now,
    });
    expect(
      (
        await database.db.processing_jobs.findUniqueOrThrow({
          where: { id: lease!.id },
        })
      ).progress,
    ).toBeNull();
    expect(await repository.saveProgress(progress, current)).toBe(false);
    const retry = await queue.claim({
      workerId: "retry-worker",
      supportedTypes: ["process_point_cloud"],
      claimedAt: now,
      staleBefore: new Date(now.getTime() - 60000),
    });
    const owner = {
      jobId: retry!.id,
      attempt: retry!.attempt,
      workerId: "retry-worker",
    };
    expect(retry!.attempt).toBe(2);
    expect(await repository.saveProgress(progress, current)).toBe(false);
    expect(await repository.saveProgress(progress, owner)).toBe(true);
    await database.db.assets.update({
      where: { id: fixture.asset.id },
      data: { status: "deleting" },
    });
    expect(await repository.saveProgress(progress, owner)).toBe(false);
    await queue.complete({
      job: retry!,
      workerId: owner.workerId,
      completedAt: now,
    });
    expect(
      (
        await database.db.processing_jobs.findUniqueOrThrow({
          where: { id: retry!.id },
        })
      ).progress,
    ).toBeNull();
  });
});
