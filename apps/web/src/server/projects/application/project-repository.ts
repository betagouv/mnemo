import type { CreateProjectInput } from "@mnemo/contracts/projects";
import type { ProjectRole } from "@mnemo/domain/project";

export type ProjectForActor = {
  id: string;
  title: string;
  address: string | null;
  description: string | null;
  role: ProjectRole;
  createdAt: Date;
  updatedAt: Date;
  assetStats?: {
    assetCount: number;
    ifcCount: number;
    pointCloudCount: number;
    processingCount: number;
    failedCount: number;
    totalSizeBytes: bigint;
  };
};

export interface ProjectRepository {
  listForActor(actorId: string): Promise<ProjectForActor[]>;
  findForActor(
    actorId: string,
    projectId: string,
  ): Promise<ProjectForActor | undefined>;
  createForActor(
    actorId: string,
    input: CreateProjectInput,
  ): Promise<ProjectForActor>;
  updateForActor(
    actorId: string,
    projectId: string,
    input: CreateProjectInput,
    updatedAt: Date,
  ): Promise<ProjectForActor | undefined>;
  requestDeletion(projectId: string, requestedAt: Date): Promise<string[]>;
}
