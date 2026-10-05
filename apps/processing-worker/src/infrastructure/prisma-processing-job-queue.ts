import { Prisma, type MnemoPrismaDatabase } from "@mnemo/database";
import type { ProcessingJobType } from "@mnemo/domain/processing-job";

import type {
  ProcessingJobLease,
  ProcessingJobQueue,
} from "../application/processing-job";

type LeaseRow = {
  id: string;
  assetId: string;
  type: ProcessingJobType;
  attempt: number;
  maxAttempts: number;
};

export class PrismaProcessingJobLeaseLostError extends Error {}

export class PrismaProcessingJobQueue implements ProcessingJobQueue {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async claim(input: {
    workerId: string;
    supportedTypes: ProcessingJobType[];
    claimedAt: Date;
    staleBefore: Date;
  }): Promise<ProcessingJobLease | null> {
    if (!input.supportedTypes.length) return null;

    return this.database.$transaction(async (transaction) => {
      const exhausted = await transaction.$queryRaw<Array<{ assetId: string }>>`
        UPDATE processing_jobs
        SET status = 'failed', completed_at = ${input.claimedAt},
            locked_at = NULL, locked_by = NULL,
            last_error = 'Worker lease expired after the maximum number of attempts',
            updated_at = ${input.claimedAt}
        WHERE status = 'running'
          AND locked_at <= ${input.staleBefore}
          AND attempts >= max_attempts
        RETURNING asset_id AS "assetId"
      `;
      if (exhausted.length) {
        await transaction.assets.updateMany({
          where: {
            id: { in: exhausted.map((row) => row.assetId) },
            status: { not: "deleting" },
          },
          data: {
            status: "failed",
            error_message:
              "Le traitement a été interrompu après le nombre maximal de tentatives.",
            updated_at: input.claimedAt,
          },
        });
      }

      const supported = Prisma.join(
        input.supportedTypes.map(
          (type) => Prisma.sql`${type}::processing_job_type`,
        ),
      );
      const claimed = await transaction.$queryRaw<LeaseRow[]>(Prisma.sql`
        WITH candidate AS (
          SELECT candidate_job.id
          FROM processing_jobs AS candidate_job
          INNER JOIN assets AS candidate_asset
            ON candidate_asset.id = candidate_job.asset_id
          WHERE candidate_asset.status <> 'deleting'
            AND candidate_job.type IN (${supported})
            AND candidate_job.attempts < candidate_job.max_attempts
            AND (
              (candidate_job.status = 'queued' AND candidate_job.available_at <= ${input.claimedAt})
              OR (candidate_job.status = 'running' AND candidate_job.locked_at <= ${input.staleBefore})
            )
          ORDER BY candidate_job.available_at ASC, candidate_job.created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE processing_jobs AS job
        SET status = 'running', attempts = job.attempts + 1,
            locked_at = ${input.claimedAt}, locked_by = ${input.workerId},
            completed_at = NULL, updated_at = ${input.claimedAt}
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING job.id, job.asset_id AS "assetId", job.type,
                  job.attempts AS attempt, job.max_attempts AS "maxAttempts"
      `);
      const job = claimed[0];
      if (!job) return null;

      await transaction.assets.updateMany({
        where: { id: job.assetId, status: { not: "deleting" } },
        data: {
          status: "processing",
          error_message: null,
          updated_at: input.claimedAt,
        },
      });
      return job;
    });
  }

  async complete(input: {
    job: ProcessingJobLease;
    workerId: string;
    completedAt: Date;
  }) {
    await this.database.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ assetId: string }>>`
        UPDATE processing_jobs
        SET status = 'succeeded', completed_at = ${input.completedAt},
            locked_at = NULL, locked_by = NULL, last_error = NULL,
            updated_at = ${input.completedAt}
        WHERE id = ${input.job.id}::uuid AND status = 'running'
          AND locked_by = ${input.workerId}
        RETURNING asset_id AS "assetId"
      `;
      const row = rows[0];
      if (!row) {
        throw new PrismaProcessingJobLeaseLostError(
          `Worker ${input.workerId} no longer owns job ${input.job.id}`,
        );
      }
      await transaction.assets.updateMany({
        where: { id: row.assetId, status: { not: "deleting" } },
        data: {
          status: "ready",
          error_message: null,
          updated_at: input.completedAt,
        },
      });
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
    await this.database.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ assetId: string }>>`
        UPDATE processing_jobs
        SET status = ${exhausted ? "failed" : "queued"}::processing_job_status,
            available_at = ${input.retryAt},
            completed_at = ${exhausted ? input.failedAt : null},
            locked_at = NULL, locked_by = NULL,
            last_error = ${input.error}, updated_at = ${input.failedAt}
        WHERE id = ${input.job.id}::uuid AND status = 'running'
          AND locked_by = ${input.workerId}
        RETURNING asset_id AS "assetId"
      `;
      const row = rows[0];
      if (!row) {
        throw new PrismaProcessingJobLeaseLostError(
          `Worker ${input.workerId} no longer owns job ${input.job.id}`,
        );
      }
      await transaction.assets.updateMany({
        where: { id: row.assetId, status: { not: "deleting" } },
        data: {
          status: exhausted ? "failed" : "processing",
          error_message: exhausted ? input.error : null,
          updated_at: input.failedAt,
        },
      });
    });
  }
}
