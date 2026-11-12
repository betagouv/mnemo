import {
  measurementContextSchema,
  saveMeasurementSchema,
  deleteMeasurementSchema,
  type SaveMeasurementInput,
  type DeleteMeasurementInput,
} from "@mnemo/contracts/measurements";
import {
  hasProjectPermission,
  type ProjectPermission,
} from "@mnemo/domain/project";
import type { ProjectRepository } from "@/server/projects/application/project-repository";
import type { MeasurementRepository } from "./measurement-repository";
export class MeasurementAccessDeniedError extends Error {
  constructor() {
    super(
      "Vous n'avez pas accès à cette opération sur les mesures du dossier.",
    );
  }
}
export class MeasurementService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly measurements: MeasurementRepository,
  ) {}
  private async authorize(
    actorId: string,
    projectId: string,
    permission: ProjectPermission,
  ) {
    const project = await this.projects.findForActor(actorId, projectId);
    if (!project || !hasProjectPermission(project, permission))
      throw new MeasurementAccessDeniedError();
  }
  async list(actorId: string, projectId: string) {
    measurementContextSchema.parse({ projectId });
    await this.authorize(actorId, projectId, "project:read");
    return this.measurements.list(projectId);
  }
  async save(actorId: string, input: SaveMeasurementInput) {
    const parsed = saveMeasurementSchema.parse(input);
    await this.authorize(actorId, parsed.projectId, "project:update");
    return this.measurements.save(actorId, parsed);
  }
  async delete(actorId: string, input: DeleteMeasurementInput) {
    const parsed = deleteMeasurementSchema.parse(input);
    await this.authorize(actorId, parsed.projectId, "project:update");
    return this.measurements.delete(parsed);
  }
}
