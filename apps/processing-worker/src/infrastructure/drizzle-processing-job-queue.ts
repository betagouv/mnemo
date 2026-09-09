import { assets, processingJobs, type MnemoDatabase } from "@mnemo/database";
import type { ProcessingJobType } from "@mnemo/domain/processing-job";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import type {
  ProcessingJobLease,
  ProcessingJobQueue,
} from "../application/processing-job";

type ProcessingJobLeaseRow = {
  id: string;
  assetId: string;
  type: ProcessingJobType;
  attempt: number;
  maxAttempts: number;
};

export class ProcessingJobLeaseLostError extends Error {}

export class DrizzleProcessingJobQueue implements ProcessingJobQueue {
  constructor(private readonly database: MnemoDatabase) {}

  async claim(input: {
    workerId: string;
    supportedTypes: ProcessingJobType[];
    claimedAt: Date;
    staleBefore: Date;
  }): Promise<ProcessingJobLease | null> {
    if (input.supportedTypes.length === 0) {
      return null;
    }

    return this.database.transaction(async (transaction) => {
      const exhaustedResult = await transaction.execute<{ assetId: string }>(
        sql`
          UPDATE processing_jobs
          SET
            status = 'failed',
            completed_at = ${input.claimedAt},
            locked_at = NULL,
            locked_by = NULL,
            last_error = 'Worker lease expired after the maximum number of attempts',
            updated_at = ${input.claimedAt}
          WHERE
            status = 'running'
            AND locked_at <= ${input.staleBefore}
            AND attempts >= max_attempts
          RETURNING asset_id AS "assetId"
        `,
      );

      const exhaustedAssetIds = exhaustedResult.rows.map((row) => row.assetId);

      if (exhaustedAssetIds.length > 0) {
        await transaction
          .update(assets)
          .set({
            status: "failed",
            errorMessage:
              "Le traitement a été interrompu après le nombre maximal de tentatives.",
            updatedAt: input.claimedAt,
          })
          .where(
            and(
              inArray(assets.id, exhaustedAssetIds),
              ne(assets.status, "deleting"),
            ),
          );
      }

      const supportedTypes = sql.join(
        input.supportedTypes.map((type) => sql`${type}::processing_job_type`),
        sql`, `,
      );
      const claimedResult = await transaction.execute<ProcessingJobLeaseRow>(
        sql`
          WITH candidate AS (
            SELECT candidate_job.id
            FROM processing_jobs AS candidate_job
            INNER JOIN assets AS candidate_asset
              ON candidate_asset.id = candidate_job.asset_id
            WHERE
              candidate_asset.status <> 'deleting'
              AND candidate_job.type IN (${supportedTypes})
              AND candidate_job.attempts < candidate_job.max_attempts
              AND (
                (
                  candidate_job.status = 'queued'
                  AND candidate_job.available_at <= ${input.claimedAt}
                )
                OR (
                  candidate_job.status = 'running'
                  AND candidate_job.locked_at <= ${input.staleBefore}
                )
              )
            ORDER BY candidate_job.available_at ASC, candidate_job.created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE processing_jobs AS job
          SET
            status = 'running',
            attempts = job.attempts + 1,
            locked_at = ${input.claimedAt},
            locked_by = ${input.workerId},
            completed_at = NULL,
            updated_at = ${input.claimedAt}
          FROM candidate
          WHERE job.id = candidate.id
          RETURNING
            job.id,
            job.asset_id AS "assetId",
            job.type,
            job.attempts AS attempt,
            job.max_attempts AS "maxAttempts"
        `,
      );
      const job = claimedResult.rows[0];

      if (!job) {
        return null;
      }

      await transaction
        .update(assets)
        .set({
          status: "processing",
          errorMessage: null,
          updatedAt: input.claimedAt,
        })
        .where(and(eq(assets.id, job.assetId), ne(assets.status, "deleting")));

      return job;
    });
  }

  async complete(input: {
    job: ProcessingJobLease;
    workerId: string;
    completedAt: Date;
  }) {
    await this.database.transaction(async (transaction) => {
      const [completedJob] = await transaction
        .update(processingJobs)
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
            eq(processingJobs.id, input.job.id),
            eq(processingJobs.status, "running"),
            eq(processingJobs.lockedBy, input.workerId),
          ),
        )
        .returning({ assetId: processingJobs.assetId });

      if (!completedJob) {
        throw new ProcessingJobLeaseLostError(
          `Worker ${input.workerId} no longer owns job ${input.job.id}`,
        );
      }

      await transaction
        .update(assets)
        .set({
          status: "ready",
          errorMessage: null,
          updatedAt: input.completedAt,
        })
        .where(
          and(
            eq(assets.id, completedJob.assetId),
            ne(assets.status, "deleting"),
          ),
        );
    });
  }

  async fail(input: {
    job: ProcessingJobLease;
    workerId: string;
    error: string;
    failedAt: Date;
    retryAt: Date;
  }) {
    const exhausted = input.job.attempt >= input.job.maxAttempts;

    await this.database.transaction(async (transaction) => {
      const [failedJob] = await transaction
        .update(processingJobs)
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
            eq(processingJobs.id, input.job.id),
            eq(processingJobs.status, "running"),
            eq(processingJobs.lockedBy, input.workerId),
          ),
        )
        .returning({ assetId: processingJobs.assetId });

      if (!failedJob) {
        throw new ProcessingJobLeaseLostError(
          `Worker ${input.workerId} no longer owns job ${input.job.id}`,
        );
      }

      await transaction
        .update(assets)
        .set({
          status: exhausted ? "failed" : "processing",
          errorMessage: exhausted ? input.error : null,
          updatedAt: input.failedAt,
        })
        .where(
          and(eq(assets.id, failedJob.assetId), ne(assets.status, "deleting")),
        );
    });
  }
}
