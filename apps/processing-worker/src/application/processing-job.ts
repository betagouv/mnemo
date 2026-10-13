import type { ProcessingJobType } from "@mnemo/domain/processing-job";

export type ProcessingJobLease = {
  id: string;
  assetId: string;
  type: ProcessingJobType;
  attempt: number;
  maxAttempts: number;
};

export interface ProcessingJobQueue {
  renew?(input: {
    job: ProcessingJobLease;
    workerId: string;
    renewedAt: Date;
  }): Promise<void>;
  claim(input: {
    workerId: string;
    supportedTypes: ProcessingJobType[];
    claimedAt: Date;
    staleBefore: Date;
  }): Promise<ProcessingJobLease | null>;
  complete(input: {
    job: ProcessingJobLease;
    workerId: string;
    completedAt: Date;
  }): Promise<void>;
  fail(input: {
    job: ProcessingJobLease;
    workerId: string;
    error: string;
    failedAt: Date;
    retryAt: Date;
  }): Promise<void>;
}

export type ProcessingJobHandler = (job: ProcessingJobLease) => Promise<void>;
export type ProcessingJobHandlers = Partial<
  Record<ProcessingJobType, ProcessingJobHandler>
>;
