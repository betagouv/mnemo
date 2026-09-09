import type { CreateProjectInput } from "@mnemo/contracts/projects";
import type { ProjectRole } from "@mnemo/domain/project";

export type ProjectForActor = {
  id: string;
  name: string;
  description: string | null;
  role: ProjectRole;
  createdAt: Date;
  updatedAt: Date;
};

export interface ProjectRepository {
  listForActor(actorId: string): Promise<ProjectForActor[]>;
  createForActor(
    actorId: string,
    input: CreateProjectInput,
  ): Promise<ProjectForActor>;
}
