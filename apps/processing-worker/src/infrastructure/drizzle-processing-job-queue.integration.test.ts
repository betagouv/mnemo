import { randomUUID } from "node:crypto";

import {
  assets,
  createDatabase,
  processingJobs,
  projectMembers,
  projects,
  users,
} from "@mnemo/database";
import type { AssetKind } from "@mnemo/domain/asset";
import { processingJobTypeForAsset } from "@mnemo/domain/processing-job";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DrizzleProcessingJobQueue } from "./drizzle-processing-job-queue";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for worker integration tests");
}

const database = createDatabase({
  connectionString: databaseUrl,
  maxConnections: 4,
});
const actorId = randomUUID();
const projectId = randomUUID();
const availableAt = new Date("2000-01-01T00:00:00.000Z");
const now = new Date("2026-09-09T14:00:00.000Z");

async function createQueuedJob(kind: AssetKind, maxAttempts = 3) {
  const assetId = randomUUID();
  const extension = kind === "ifc" ? "ifc" : "laz";
  const [asset] = await database.db
    .insert(assets)
    .values({
      id: assetId,
      projectId,
      kind,
      originalFileName: `fixture.${extension}`,
      mediaType: "application/octet-stream",
      sizeBytes: 42,
      originalObjectKey: `projects/${projectId}/assets/${assetId}/original.${extension}`,
      status: "uploaded",
      createdBy: actorId,
      uploadExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
      uploadedAt: now,
    })
    .returning();
  const [job] = await database.db
    .insert(processingJobs)
    .values({
      assetId,
      type: processingJobTypeForAsset(kind),
      maxAttempts,
      availableAt,
      createdAt: availableAt,
      updatedAt: availableAt,
    })
    .returning();

  if (!asset || !job) {
    throw new Error("Failed to create worker test fixture");
  }

  return { asset, job };
}

describe("DrizzleProcessingJobQueue", () => {
  beforeAll(async () => {
    await database.db.insert(users).values({
      id: actorId,
      email: `${actorId}@test.mnemo.local`,
      displayName: "Worker queue actor",
    });
    await database.db.insert(projects).values({
      id: projectId,
      name: "Worker queue project",
      createdBy: actorId,
    });
    await database.db.insert(projectMembers).values({
      projectId,
      userId: actorId,
      role: "owner",
    });
  });

  afterAll(async () => {
    await database.db.delete(projects).where(eq(projects.id, projectId));
    await database.db.delete(users).where(eq(users.id, actorId));
    await database.close();
  });

  it("leases one job per worker and completes the related asset", async () => {
    const ifcFixture = await createQueuedJob("ifc");
    const pointCloudFixture = await createQueuedJob("point_cloud");
    const queue = new DrizzleProcessingJobQueue(database.db);

    const leases = await Promise.all([
      queue.claim({
        workerId: "worker-a",
        supportedTypes: ["process_ifc", "process_point_cloud"],
        claimedAt: now,
        staleBefore: new Date(now.getTime() - 60_000),
      }),
      queue.claim({
        workerId: "worker-b",
        supportedTypes: ["process_ifc", "process_point_cloud"],
        claimedAt: now,
        staleBefore: new Date(now.getTime() - 60_000),
      }),
    ]);

    expect(leases.every(Boolean)).toBe(true);
    expect(new Set(leases.map((lease) => lease?.id))).toEqual(
      new Set([ifcFixture.job.id, pointCloudFixture.job.id]),
    );

    const firstLease = leases[0]!;
    await queue.complete({
      job: firstLease,
      workerId: "worker-a",
      completedAt: now,
    });

    await expect(
      database.db
        .select({ status: processingJobs.status })
        .from(processingJobs)
        .where(eq(processingJobs.id, firstLease.id)),
    ).resolves.toEqual([{ status: "succeeded" }]);
    await expect(
      database.db
        .select({ status: assets.status })
        .from(assets)
        .where(eq(assets.id, firstLease.assetId)),
    ).resolves.toEqual([{ status: "ready" }]);
  });

  it("marks both job and asset failed after the last attempt", async () => {
    const fixture = await createQueuedJob("ifc", 1);
    const queue = new DrizzleProcessingJobQueue(database.db);
    const lease = await queue.claim({
      workerId: "worker-failure",
      supportedTypes: ["process_ifc"],
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
      database.db
        .select({ status: processingJobs.status })
        .from(processingJobs)
        .where(eq(processingJobs.id, fixture.job.id)),
    ).resolves.toEqual([{ status: "failed" }]);
    await expect(
      database.db
        .select({ status: assets.status, error: assets.errorMessage })
        .from(assets)
        .where(eq(assets.id, fixture.asset.id)),
    ).resolves.toEqual([{ status: "failed", error: "converter failed" }]);
  });

  it("reclaims a lease left behind by a crashed worker", async () => {
    const fixture = await createQueuedJob("point_cloud");
    const staleLock = new Date(now.getTime() - 120_000);
    await database.db
      .update(processingJobs)
      .set({
        status: "running",
        attempts: 1,
        lockedAt: staleLock,
        lockedBy: "dead-worker",
      })
      .where(eq(processingJobs.id, fixture.job.id));
    const queue = new DrizzleProcessingJobQueue(database.db);

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
      database.db
        .select({ lockedBy: processingJobs.lockedBy })
        .from(processingJobs)
        .where(eq(processingJobs.id, fixture.job.id)),
    ).resolves.toEqual([{ lockedBy: "replacement-worker" }]);
  });

  it("does not claim or revive an asset that is being deleted", async () => {
    const fixture = await createQueuedJob("ifc");
    await database.db
      .update(assets)
      .set({ status: "deleting" })
      .where(eq(assets.id, fixture.asset.id));
    const queue = new DrizzleProcessingJobQueue(database.db);

    await expect(
      queue.claim({
        workerId: "worker-deletion-race",
        supportedTypes: ["process_ifc"],
        claimedAt: now,
        staleBefore: new Date(now.getTime() - 60_000),
      }),
    ).resolves.toBeNull();

    await expect(
      database.db
        .select({ status: assets.status })
        .from(assets)
        .where(eq(assets.id, fixture.asset.id)),
    ).resolves.toEqual([{ status: "deleting" }]);
  });
});
