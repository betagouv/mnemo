import type {
  BcfComment,
  BcfTopic,
  BcfTopicStatus,
  BcfViewpoint,
  BcfViewpointPayload,
  CreateBcfTopicInput,
  UpdateBcfTopicInput,
  BcfProjectOptions,
  BcfTopicSummary,
  BcfMarkerTopic,
  BcfExchangeMetadata,
} from "@mnemo/contracts/bcf";

export type StoredBcfComment = BcfComment & {
  authorEmail: string;
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
  exchangeMetadata?: BcfExchangeMetadata;
  comments: StoredBcfComment[];
  viewpoints: StoredBcfViewpoint[];
};

export type CreateBcfTopicRecord = Omit<CreateBcfTopicInput, "projectId"> & {
  id: string;
  projectId: string;
  createdBy: string;
  createdAt: Date;
  preparedViewpoint?: PreparedBcfViewpoint;
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
  exchangeMetadata?: BcfExchangeMetadata;
  createdAt: Date;
  updatedAt: Date;
  assignedTo?: string | null;
  dueDate?: string | null;
  labels?: string[];
  modifiedAuthor?: string | null;
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

export type PreparedBcfViewpoint = Omit<
  Parameters<BcfTopicRepository["createViewpoint"]>[0],
  "projectId" | "topicId"
> & { uploadId?: string };
export type BcfSnapshotUpload = {
  id: string;
  projectId: string;
  actorId: string;
  objectKey: string;
  mediaType: string;
  sizeBytes: number;
  expiresAt: Date;
};
export interface BcfTopicRepository {
  markers(projectId: string): Promise<BcfMarkerTopic[]>;
  summaries(projectId: string): Promise<BcfTopicSummary[]>;
  find(projectId: string, topicId: string): Promise<StoredBcfTopic | null>;
  members(
    projectId: string,
  ): Promise<Array<{ id: string; name: string; email: string }>>;
  options(projectId: string): Promise<BcfProjectOptions>;
  findSnapshot(
    projectId: string,
    topicId: string,
    viewpointId: string,
  ): Promise<{ objectKey: string } | null>;
  update(
    input: UpdateBcfTopicInput & { modifiedAuthor: string; updatedAt: Date },
  ): Promise<StoredBcfTopic | null>;
  protectSnapshot(
    id: string,
    objectKey: string,
    expiresAt: Date,
  ): Promise<void>;
  prepareUpload(input: BcfSnapshotUpload): Promise<void>;
  findUpload(
    projectId: string,
    actorId: string,
    uploadId: string,
  ): Promise<BcfSnapshotUpload | null>;

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
    preparedViewpoint?: PreparedBcfViewpoint;
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
    uploadId?: string;
  }): Promise<StoredBcfTopic | null>;
}
