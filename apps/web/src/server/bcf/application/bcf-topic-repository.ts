import type {
  BcfTopic,
  BcfTopicStatus,
  BcfViewpoint,
  BcfViewpointPayload,
  CreateBcfTopicInput,
} from "@mnemo/contracts/bcf";

export type StoredBcfViewpoint = Omit<BcfViewpoint, "snapshotUrl"> & {
  snapshotObjectKey: string | null;
  snapshotMediaType: string | null;
  snapshotExpectedSize: number | null;
  snapshotUploadedAt: string | null;
};

export type StoredBcfTopic = Omit<BcfTopic, "viewpoints"> & {
  viewpoints: StoredBcfViewpoint[];
};

export type CreateBcfTopicRecord = Omit<CreateBcfTopicInput, "projectId"> & {
  id: string;
  projectId: string;
  createdBy: string;
  createdAt: Date;
};

export interface BcfTopicRepository {
  list(projectId: string): Promise<StoredBcfTopic[]>;
  create(input: CreateBcfTopicRecord): Promise<StoredBcfTopic>;
  addComment(input: {
    id: string;
    projectId: string;
    topicId: string;
    authorId: string;
    comment: string;
    createdAt: Date;
  }): Promise<StoredBcfTopic | null>;
  updateStatus(input: {
    projectId: string;
    topicId: string;
    status: BcfTopicStatus;
    updatedAt: Date;
  }): Promise<StoredBcfTopic | null>;
  createViewpoint(input: {
    id: string;
    projectId: string;
    topicId: string;
    data: BcfViewpointPayload;
    targetDistance: number;
    snapshotObjectKey: string | null;
    snapshotMediaType: string | null;
    snapshotExpectedSize: number | null;
    createdBy: string;
    createdAt: Date;
  }): Promise<StoredBcfTopic | null>;
  findViewpoint(
    projectId: string,
    topicId: string,
    viewpointId: string,
  ): Promise<StoredBcfViewpoint | null>;
  markViewpointSnapshotUploaded(input: {
    projectId: string;
    topicId: string;
    viewpointId: string;
    uploadedAt: Date;
  }): Promise<StoredBcfTopic | null>;
}
