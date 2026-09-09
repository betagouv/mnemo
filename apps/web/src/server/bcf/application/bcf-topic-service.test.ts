import type { BcfTopic } from "@mnemo/contracts/bcf";
import { describe, expect, it, vi } from "vitest";

import type { ProjectRepository } from "@/server/projects/application/project-repository";

import {
  BcfTopicAccessDeniedError,
  BcfTopicNotFoundError,
} from "./bcf-topic-errors";
import type { BcfTopicRepository } from "./bcf-topic-repository";
import { BcfTopicService } from "./bcf-topic-service";

const projectId = "d14ccec4-b8c9-437e-89af-0690c9c9682b";
const topicId = "a805b627-40b3-45c1-9d13-91042c67f025";
const now = new Date("2026-09-09T19:00:00.000Z");

function topic(): BcfTopic {
  return {
    id: topicId,
    projectId,
    title: "Porte à vérifier",
    description: null,
    type: "issue",
    status: "open",
    priority: "normal",
    authorName: "Erwan",
    components: [],
    comments: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function projects(role: "owner" | "editor" | "viewer"): ProjectRepository {
  return {
    listForActor: async () => [],
    findForActor: async () => ({
      id: projectId,
      name: "Projet",
      description: null,
      role,
      createdAt: now,
      updatedAt: now,
    }),
    createForActor: async () => {
      throw new Error("not used");
    },
    requestDeletion: async () => undefined,
  };
}

function repository(): BcfTopicRepository {
  return {
    list: vi.fn(async () => [topic()]),
    create: vi.fn(async () => topic()),
    addComment: vi.fn(async () => topic()),
    updateStatus: vi.fn(async () => topic()),
  };
}

describe("BcfTopicService", () => {
  it("creates a component-linked topic for an editor", async () => {
    const topics = repository();
    const service = new BcfTopicService(topics, projects("editor"), {
      createId: () => topicId,
      now: () => now,
    });

    await expect(
      service.create("actor", {
        projectId,
        title: "Porte à vérifier",
        type: "issue",
        priority: "normal",
        component: {
          assetId: "ab64313e-7774-4294-a09d-f693d3cc68b8",
          expressId: 42,
          globalId: "0YvctA6Hn0pgmBdv0cPwH6",
        },
      }),
    ).resolves.toMatchObject({ id: topicId });
    expect(topics.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: topicId,
        createdBy: "actor",
        createdAt: now,
      }),
    );
  });

  it("allows viewers to read but not write topics", async () => {
    const service = new BcfTopicService(repository(), projects("viewer"));

    await expect(service.list("actor", projectId)).resolves.toHaveLength(1);
    await expect(
      service.create("actor", {
        projectId,
        title: "Interdit",
        type: "issue",
        priority: "normal",
      }),
    ).rejects.toBeInstanceOf(BcfTopicAccessDeniedError);
  });

  it("does not add a comment to a topic outside the project", async () => {
    const topics = repository();
    topics.addComment = async () => null;
    const service = new BcfTopicService(topics, projects("owner"));

    await expect(
      service.addComment("actor", {
        projectId,
        topicId,
        comment: "À contrôler",
      }),
    ).rejects.toBeInstanceOf(BcfTopicNotFoundError);
  });
});
