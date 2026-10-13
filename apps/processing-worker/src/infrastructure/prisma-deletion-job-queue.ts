import { Prisma, type MnemoPrismaDatabase } from "@mnemo/database";

import type {
  DeletionJobLease,
  DeletionJobType,
} from "../application/delete-resource";
import type { BackgroundJobQueue } from "../application/processing-worker";

export class PrismaDeletionJobLeaseLostError extends Error {}

export class PrismaDeletionJobQueue implements BackgroundJobQueue<
  DeletionJobType,
  DeletionJobLease
> {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async renew(input: {
    job: DeletionJobLease;
    workerId: string;
    renewedAt: Date;
  }) {
    const result = await this.database.deletion_jobs.updateMany({
      where: { id: input.job.id, status: "running", locked_by: input.workerId },
      data: { locked_at: input.renewedAt, updated_at: input.renewedAt },
    });
    if (!result.count)
      throw new PrismaDeletionJobLeaseLostError(
        `Job ${input.job.id} lease was lost`,
      );
  }

  async claim(input: {
    workerId: string;
    supportedTypes: DeletionJobType[];
    claimedAt: Date;
    staleBefore: Date;
  }) {
    if (!input.supportedTypes.length) return null;

    return this.database.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        UPDATE deletion_jobs
        SET status = 'failed', completed_at = ${input.claimedAt},
            locked_at = NULL, locked_by = NULL,
            last_error = 'Deletion worker lease expired after the maximum number of attempts',
            updated_at = ${input.claimedAt}
        WHERE status = 'running'
          AND locked_at <= ${input.staleBefore}
          AND attempts >= max_attempts
      `;

      const supported = Prisma.join(
        input.supportedTypes.map(
          (type) => Prisma.sql`${type}::deletion_job_type`,
        ),
      );
      const rows = await transaction.$queryRaw<DeletionJobLease[]>(Prisma.sql`
        WITH candidate AS (
          SELECT id
          FROM deletion_jobs
          WHERE type IN (${supported})
            AND attempts < max_attempts
            AND (
              (status = 'queued' AND available_at <= ${input.claimedAt})
              OR (status = 'running' AND locked_at <= ${input.staleBefore})
            )
          ORDER BY available_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE deletion_jobs AS job
        SET status = 'running', attempts = job.attempts + 1,
            locked_at = ${input.claimedAt}, locked_by = ${input.workerId},
            updated_at = ${input.claimedAt}
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING job.id, job.resource_id AS "resourceId", job.type,
                  job.object_keys AS "objectKeys", job.attempts AS attempt,
                  job.max_attempts AS "maxAttempts"
      `);
      return rows[0] ?? null;
    });
  }

  async complete(input: {
    job: DeletionJobLease;
    workerId: string;
    completedAt: Date;
  }) {
    const result = await this.database.deletion_jobs.updateMany({
      where: { id: input.job.id, status: "running", locked_by: input.workerId },
      data: {
        status: "succeeded",
        completed_at: input.completedAt,
        locked_at: null,
        locked_by: null,
        last_error: null,
        updated_at: input.completedAt,
      },
    });
    if (!result.count) {
      throw new PrismaDeletionJobLeaseLostError(
        `Worker ${input.workerId} no longer owns job ${input.job.id}`,
      );
    }
  }

  async fail(input: {
    job: DeletionJobLease;
    workerId: string;
    error: string;
    failedAt: Date;
    retryAt: Date;
  }) {
    const exhausted = input.job.attempt >= input.job.maxAttempts;
    const result = await this.database.deletion_jobs.updateMany({
      where: { id: input.job.id, status: "running", locked_by: input.workerId },
      data: {
        status: exhausted ? "failed" : "queued",
        available_at: input.retryAt,
        completed_at: exhausted ? input.failedAt : null,
        locked_at: null,
        locked_by: null,
        last_error: input.error,
        updated_at: input.failedAt,
      },
    });
    if (!result.count) {
      throw new PrismaDeletionJobLeaseLostError(
        `Worker ${input.workerId} no longer owns job ${input.job.id}`,
      );
    }
  }
}
