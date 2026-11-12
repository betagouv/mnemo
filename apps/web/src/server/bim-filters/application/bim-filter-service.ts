import { z } from "zod";
import {
  saveBimFiltersSchema,
  type SaveBimFiltersInput,
} from "@mnemo/contracts/bim-filters";
import {
  hasProjectPermission,
  type ProjectPermission,
} from "@mnemo/domain/project";
import type { ProjectRepository } from "@/server/projects/application/project-repository";
import type { BimFilterRepository } from "./bim-filter-repository";

export class BimFilterAccessDeniedError extends Error {
  constructor() {
    super(
      "Vous n'avez pas les droits nécessaires sur les filtres de ce dossier.",
    );
  }
}
export class BimFilterService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly filters: BimFilterRepository,
  ) {}
  private async authorize(
    actorId: string,
    projectId: string,
    permission: ProjectPermission,
  ) {
    const project = await this.projects.findForActor(actorId, projectId);
    if (!project || !hasProjectPermission(project, permission))
      throw new BimFilterAccessDeniedError();
  }
  async list(actorId: string, projectId: string) {
    z.uuid().parse(projectId);
    await this.authorize(actorId, projectId, "project:read");
    return this.filters.list(projectId);
  }
  async save(actorId: string, input: SaveBimFiltersInput) {
    const parsed = saveBimFiltersSchema.parse(input);
    await this.authorize(actorId, parsed.projectId, "project:update");
    return this.filters.save(parsed);
  }
}
