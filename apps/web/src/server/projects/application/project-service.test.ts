import { describe, expect, it } from "vitest";

import type { ProjectForActor, ProjectRepository } from "./project-repository";
import { ProjectService } from "./project-service";

class InMemoryProjectRepository implements ProjectRepository {
  readonly projects: ProjectForActor[] = [];
  readonly deletionRequests: string[] = [];

  async listForActor() {
    return this.projects;
  }

  async findForActor(_actorId: string, projectId: string) {
    return this.projects.find((project) => project.id === projectId);
  }

  async createForActor(
    _actorId: string,
    input: { name: string; description?: string },
  ) {
    const project: ProjectForActor = {
      id: "bb668746-147b-4e44-bcd8-307e3869d7f2",
      name: input.name,
      description: input.description ?? null,
      role: "owner",
      createdAt: new Date("2026-09-09T10:00:00.000Z"),
      updatedAt: new Date("2026-09-09T10:00:00.000Z"),
    };
    this.projects.push(project);
    return project;
  }

  async requestDeletion(projectId: string) {
    this.deletionRequests.push(projectId);
  }
}

describe("ProjectService", () => {
  it("creates a project whose actor is the owner", async () => {
    const repository = new InMemoryProjectRepository();
    const service = new ProjectService(repository);

    await expect(
      service.create("actor-id", {
        name: "Musée des Arts",
        description: "Scan et maquette",
      }),
    ).resolves.toMatchObject({
      name: "Musée des Arts",
      description: "Scan et maquette",
      role: "owner",
      createdAt: "2026-09-09T10:00:00.000Z",
    });
  });

  it("returns only projects supplied for the current actor", async () => {
    const repository = new InMemoryProjectRepository();
    const service = new ProjectService(repository);
    await service.create("actor-id", { name: "Projet partagé" });

    await expect(service.list("actor-id")).resolves.toHaveLength(1);
  });

  it("does not expose a project missing from the actor repository view", async () => {
    const service = new ProjectService(new InMemoryProjectRepository());

    await expect(
      service.find("actor-id", "e4891586-f3d9-4d60-9f22-e16be897cb6b"),
    ).resolves.toBeNull();
  });

  it("lets only an owner request project deletion", async () => {
    const repository = new InMemoryProjectRepository();
    const service = new ProjectService(repository);
    const project = await service.create("actor-id", { name: "À supprimer" });

    await expect(service.delete("actor-id", project.id)).resolves.toEqual({
      accepted: true,
    });
    expect(repository.deletionRequests).toEqual([project.id]);

    repository.projects[0] = { ...repository.projects[0]!, role: "editor" };
    await expect(service.delete("actor-id", project.id)).resolves.toEqual({
      accepted: false,
    });
  });
});
