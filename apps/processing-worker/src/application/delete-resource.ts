import type { BackgroundJobLease } from "./processing-worker";

export const deletionJobTypes = ["delete_asset", "delete_project"] as const;
export type DeletionJobType = (typeof deletionJobTypes)[number];

export type DeletionJobLease = BackgroundJobLease<DeletionJobType> & {
  resourceId: string;
  objectKeys: string[];
};

export interface DeletedResourceRepository {
  deleteRecord(type: DeletionJobType, resourceId: string): Promise<void>;
}

export interface ObjectDeleter {
  deleteObject(objectKey: string): Promise<void>;
}

export function createDeleteResourceHandler(input: {
  resources: DeletedResourceRepository;
  storage: ObjectDeleter;
}) {
  return async (job: DeletionJobLease) => {
    for (const objectKey of job.objectKeys) {
      await input.storage.deleteObject(objectKey);
    }

    await input.resources.deleteRecord(job.type, job.resourceId);
  };
}
