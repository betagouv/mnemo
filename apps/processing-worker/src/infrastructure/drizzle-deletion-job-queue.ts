import { deletionJobs, type MnemoDatabase } from "@mnemo/database";
import { and, eq, sql } from "drizzle-orm";

import type {
  DeletionJobLease,
  DeletionJobType,
} from "../application/delete-resource";
import type { BackgroundJobQueue } from "../application/processing-worker";

export class DeletionJobLeaseLostError extends Error {}

export class DrizzleDeletionJobQueue implements BackgroundJobQueue<
  DeletionJobType,
  DeletionJobLease
> {
  constructor(private readonly database: MnemoDatabase) {}

  async claim(input: {
    workerId: string;
    supportedTypes: DeletionJobType[];
    claimedAt: Date;
    staleBefore: Date;
  }) {
    if (!input.supportedTypes.length) return null;

    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql`
        UPDATE deletion_jobs
        SET
          status = 'failed',
          completed_at = ${input.claimedAt},
          locked_at = NULL,
          locked_by = NULL,
          last_error = 'Deletion worker lease expired after the maximum number of attempts',
          updated_at = ${input.claimedAt}
        WHERE
          status = 'running'
          AND locked_at <= ${input.staleBefore}
          AND attempts >= max_attempts
      `);

      const supportedTypes = sql.join(
        input.supportedTypes.map((type) => sql`${type}::deletion_job_type`),
        sql`, `,
      );
      const result = await transaction.execute<DeletionJobLease>(sql`
        WITH candidate AS (
          SELECT id
          FROM deletion_jobs
          WHERE
            type IN (${supportedTypes})
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
        SET
          status = 'running',
          attempts = job.attempts + 1,
          locked_at = ${input.claimedAt},
          locked_by = ${input.workerId},
          updated_at = ${input.claimedAt}
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING
          job.id,
          job.resource_id AS "resourceId",
          job.type,
          job.object_keys AS "objectKeys",
          job.attempts AS attempt,
          job.max_attempts AS "maxAttempts"
      `);

      return result.rows[0] ?? null;
    });
  }

  async complete(input: {
    job: DeletionJobLease;
    workerId: string;
    completedAt: Date;
  }) {
    const [completedJob] = await this.database
      .update(deletionJobs)
      .set({
        status: "succeeded",
        completedAt: input.completedAt,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        updatedAt: input.completedAt,
      })
      .where(
        and(
          eq(deletionJobs.id, input.job.id),
          eq(deletionJobs.status, "running"),
          eq(deletionJobs.lockedBy, input.workerId),
        ),
      )
      .returning({ id: deletionJobs.id });

    if (!completedJob) {
      throw new DeletionJobLeaseLostError(
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
    const [failedJob] = await this.database
      .update(deletionJobs)
      .set({
        status: exhausted ? "failed" : "queued",
        availableAt: input.retryAt,
        completedAt: exhausted ? input.failedAt : null,
        lockedAt: null,
        lockedBy: null,
        lastError: input.error,
        updatedAt: input.failedAt,
      })
      .where(
        and(
          eq(deletionJobs.id, input.job.id),
          eq(deletionJobs.status, "running"),
          eq(deletionJobs.lockedBy, input.workerId),
        ),
      )
      .returning({ id: deletionJobs.id });

    if (!failedJob) {
      throw new DeletionJobLeaseLostError(
        `Worker ${input.workerId} no longer owns job ${input.job.id}`,
      );
    }
  }
}
