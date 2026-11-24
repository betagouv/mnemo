import {
  pinProjectMapReferenceInputSchema,
  type PinProjectMapReferenceInput,
  type ProjectMapReference,
} from "@mnemo/contracts/map-reference";
import { hasProjectPermission } from "@mnemo/domain/project";
import type { ProjectRepository } from "@/server/projects/application/project-repository";

export interface MapReferenceRepository {
  find(projectId: string): Promise<ProjectMapReference | null>;
  /** Keep the first reference of the project and return the retained one. */
  pin(
    projectId: string,
    reference: ProjectMapReference,
  ): Promise<ProjectMapReference>;
}

export class MapReferenceAccessDeniedError extends Error {
  constructor() {
    super("Vous n'avez pas accès au repère de ce dossier.");
  }
}

export class MapReferenceService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly references: MapReferenceRepository,
  ) {}

  async find(actorId: string, projectId: string) {
    await this.authorize(actorId, projectId);
    return this.references.find(projectId);
  }

  async pin(actorId: string, input: PinProjectMapReferenceInput) {
    const { projectId, reference } =
      pinProjectMapReferenceInputSchema.parse(input);
    const project = await this.authorize(actorId, projectId);
    // Readers cannot save coordinates, so their session needs no shared frame.
    if (
      !hasProjectPermission(project, "project:update") &&
      !hasProjectPermission(project, "bcf:viewpoint:create")
    )
      return (await this.references.find(projectId)) ?? reference;
    return this.references.pin(projectId, reference);
  }

  private async authorize(actorId: string, projectId: string) {
    const project = await this.projects.findForActor(actorId, projectId);
    if (!project || !hasProjectPermission(project, "project:read"))
      throw new MapReferenceAccessDeniedError();
    return project;
  }
}
