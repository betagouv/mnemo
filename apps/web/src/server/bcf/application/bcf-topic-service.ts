import { randomUUID } from "node:crypto";

import type {
  AddBcfCommentInput,
  CreateBcfTopicInput,
  UpdateBcfTopicStatusInput,
} from "@mnemo/contracts/bcf";
import { hasProjectPermission } from "@mnemo/domain/project";

import type { ProjectRepository } from "@/server/projects/application/project-repository";

import {
  BcfTopicAccessDeniedError,
  BcfTopicNotFoundError,
} from "./bcf-topic-errors";
import type { BcfTopicRepository } from "./bcf-topic-repository";

export type BcfTopicServiceOptions = {
  createId?: () => string;
  now?: () => Date;
};

export class BcfTopicService {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly topics: BcfTopicRepository,
    private readonly projects: ProjectRepository,
    options: BcfTopicServiceOptions = {},
  ) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  async list(actorId: string, projectId: string) {
    await this.requireProject(actorId, projectId, false);
    return this.topics.list(projectId);
  }

  async create(actorId: string, input: CreateBcfTopicInput) {
    await this.requireProject(actorId, input.projectId, true);
    return this.topics.create({
      ...input,
      id: this.createId(),
      createdBy: actorId,
      createdAt: this.now(),
    });
  }

  async addComment(actorId: string, input: AddBcfCommentInput) {
    await this.requireProject(actorId, input.projectId, true);
    const topic = await this.topics.addComment({
      ...input,
      id: this.createId(),
      authorId: actorId,
      createdAt: this.now(),
    });
    if (!topic) throw new BcfTopicNotFoundError("BCF topic was not found");
    return topic;
  }

  async updateStatus(actorId: string, input: UpdateBcfTopicStatusInput) {
    await this.requireProject(actorId, input.projectId, true);
    const topic = await this.topics.updateStatus({
      ...input,
      updatedAt: this.now(),
    });
    if (!topic) throw new BcfTopicNotFoundError("BCF topic was not found");
    return topic;
  }

  private async requireProject(
    actorId: string,
    projectId: string,
    write: boolean,
  ) {
    const project = await this.projects.findForActor(actorId, projectId);
    if (
      !project ||
      (write && !hasProjectPermission(project.role, "bcf:write"))
    ) {
      throw new BcfTopicAccessDeniedError(
        write
          ? "The actor cannot update BCF topics in this project"
          : "BCF topics are not available to this actor",
      );
    }
    return project;
  }
}
