import type {
  BcfTopic,
  BcfTopicStatus,
  CreateBcfTopicInput,
} from "@mnemo/contracts/bcf";

export type CreateBcfTopicRecord = Omit<CreateBcfTopicInput, "projectId"> & {
  id: string;
  projectId: string;
  createdBy: string;
  createdAt: Date;
};

export interface BcfTopicRepository {
  list(projectId: string): Promise<BcfTopic[]>;
  create(input: CreateBcfTopicRecord): Promise<BcfTopic>;
  addComment(input: {
    id: string;
    projectId: string;
    topicId: string;
    authorId: string;
    comment: string;
    createdAt: Date;
  }): Promise<BcfTopic | null>;
  updateStatus(input: {
    projectId: string;
    topicId: string;
    status: BcfTopicStatus;
    updatedAt: Date;
  }): Promise<BcfTopic | null>;
}
