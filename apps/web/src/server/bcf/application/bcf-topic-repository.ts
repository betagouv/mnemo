import type {
  BcfComment,
  BcfTopic,
  BcfTopicStatus,
  BcfViewpoint,
  BcfViewpointPayload,
  CreateBcfTopicInput,
} from "@mnemo/contracts/bcf";

export type StoredBcfComment = BcfComment & {
  bcfGuid: string;
  viewpointBcfGuid: string | null;
};

export type StoredBcfViewpoint = Omit<BcfViewpoint, "snapshotUrl"> & {
  bcfGuid: string;
  snapshotObjectKey: string | null;
  snapshotMediaType: string | null;
  snapshotExpectedSize: number | null;
  snapshotUploadedAt: string | null;
};

export type StoredBcfTopic = Omit<BcfTopic, "comments" | "viewpoints"> & {
  bcfGuid: string;
  comments: StoredBcfComment[];
  viewpoints: StoredBcfViewpoint[];
};

export type CreateBcfTopicRecord = Omit<CreateBcfTopicInput, "projectId"> & {
  id: string;
  projectId: string;
  createdBy: string;
  createdAt: Date;
};

export type ImportBcfTopicRecord = {
  id: string;
  bcfGuid: string;
  projectId: string;
  title: string;
  description: string | null;
  type: BcfTopic["type"];
  status: BcfTopic["status"];
  priority: BcfTopic["priority"];
  createdBy: string;
  externalAuthor: string;
  createdAt: Date;
  updatedAt: Date;
  components: Array<{
    id: string;
    globalId: string;
  }>;
  comments: Array<{
    id: string;
    bcfGuid: string;
    externalAuthor: string;
    comment: string;
    viewpointBcfGuid: string | null;
    createdAt: Date;
  }>;
  viewpoints: Array<{
    id: string;
    bcfGuid: string;
    data: BcfViewpointPayload;
    targetDistance: number;
    snapshotObjectKey: string | null;
    snapshotMediaType: string | null;
    snapshotExpectedSize: number | null;
    snapshotUploadedAt: Date | null;
    externalAuthor: string;
    createdAt: Date;
  }>;
};

export interface BcfTopicRepository {
  list(projectId: string): Promise<StoredBcfTopic[]>;
  create(input: CreateBcfTopicRecord): Promise<StoredBcfTopic>;
  importTopics(input: ImportBcfTopicRecord[]): Promise<{
    insertedTopicIds: string[];
    skippedBcfGuids: string[];
  }>;
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
