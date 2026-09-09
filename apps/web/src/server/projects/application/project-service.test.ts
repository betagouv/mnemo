import { describe, expect, it } from "vitest";

import type { ProjectForActor, ProjectRepository } from "./project-repository";
import { ProjectService } from "./project-service";

class InMemoryProjectRepository implements ProjectRepository {
  readonly projects: ProjectForActor[] = [];

  async listForActor() {
    return this.projects;
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
});
