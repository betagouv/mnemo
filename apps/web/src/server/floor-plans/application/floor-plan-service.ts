import {
  deleteFloorPlanSchema,
  floorPlanContextSchema,
  saveFloorPlanSchema,
  type SaveFloorPlanInput,
  type DeleteFloorPlanInput,
} from "@mnemo/contracts/floor-plans";
import {
  hasProjectPermission,
  type ProjectPermission,
} from "@mnemo/domain/project";
import type { ProjectRepository } from "@/server/projects/application/project-repository";
import type { FloorPlanRepository } from "./floor-plan-repository";

export class FloorPlanAccessDeniedError extends Error {
  constructor() {
    super("Vous n'avez pas accès à cette opération sur les vues du dossier.");
  }
}
export class FloorPlanService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly plans: FloorPlanRepository,
  ) {}
  private async authorize(
    actorId: string,
    projectId: string,
    permission: ProjectPermission,
  ) {
    const project = await this.projects.findForActor(actorId, projectId);
    if (!project || !hasProjectPermission(project, permission))
      throw new FloorPlanAccessDeniedError();
  }
  async list(actorId: string, projectId: string) {
    floorPlanContextSchema.parse({ projectId });
    await this.authorize(actorId, projectId, "project:read");
    return this.plans.list(projectId);
  }
  async save(actorId: string, input: SaveFloorPlanInput) {
    const parsed = saveFloorPlanSchema.parse(input);
    await this.authorize(actorId, parsed.projectId, "project:update");
    return this.plans.save(parsed);
  }
  async delete(actorId: string, input: DeleteFloorPlanInput) {
    const parsed = deleteFloorPlanSchema.parse(input);
    await this.authorize(actorId, parsed.projectId, "project:update");
    return this.plans.delete(parsed);
  }
}
