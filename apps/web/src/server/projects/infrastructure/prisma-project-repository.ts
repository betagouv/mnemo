import type { CreateProjectInput } from "@mnemo/contracts/projects";
import type { MnemoPrismaDatabase } from "@mnemo/database";

import type {
  ProjectForActor,
  ProjectRepository,
} from "../application/project-repository";

export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async listForActor(actorId: string): Promise<ProjectForActor[]> {
    const memberships = await this.database.project_members.findMany({
      where: { user_id: actorId, projects: { archived_at: null } },
      include: { projects: true },
      orderBy: { projects: { updated_at: "desc" } },
    });

    return memberships.map(({ role, projects: project }) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      role,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    }));
  }

  async findForActor(
    actorId: string,
    projectId: string,
  ): Promise<ProjectForActor | undefined> {
    const membership = await this.database.project_members.findUnique({
      where: {
        project_id_user_id: { project_id: projectId, user_id: actorId },
      },
      include: { projects: true },
    });

    if (!membership || membership.projects.archived_at) return undefined;
    return {
      id: membership.projects.id,
      name: membership.projects.name,
      description: membership.projects.description,
      role: membership.role,
      createdAt: membership.projects.created_at,
      updatedAt: membership.projects.updated_at,
    };
  }

  async createForActor(
    actorId: string,
    input: CreateProjectInput,
  ): Promise<ProjectForActor> {
    const project = await this.database.projects.create({
      data: {
        name: input.name,
        description: input.description || null,
        created_by: actorId,
        project_members: { create: { user_id: actorId, role: "owner" } },
      },
    });

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      role: "owner",
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    };
  }

  async requestDeletion(projectId: string, requestedAt: Date) {
    return this.database.$transaction(async (transaction) => {
      const result = await transaction.projects.updateMany({
        where: { id: projectId },
        data: { archived_at: requestedAt, updated_at: requestedAt },
      });
      if (result.count === 0) return [];

      const [assets, viewpoints, artifacts] = await Promise.all([
        transaction.assets.findMany({
          where: { project_id: projectId },
          select: { id: true, original_object_key: true },
        }),
        transaction.bcf_viewpoints.findMany({
          where: { bcf_topics: { project_id: projectId } },
          select: { snapshot_object_key: true },
        }),
        transaction.point_cloud_processing_results.findMany({
          where: { assets: { project_id: projectId } },
          select: {
            metadata_object_key: true,
            hierarchy_object_key: true,
            octree_object_key: true,
          },
        }),
      ]);

      await transaction.assets.updateMany({
        where: { project_id: projectId },
        data: { status: "deleting", updated_at: requestedAt },
      });
      await transaction.deletion_jobs.createMany({
        data: [
          {
            resource_id: projectId,
            type: "delete_project",
            object_keys: [
              ...assets.map((asset) => asset.original_object_key),
              ...viewpoints.flatMap((viewpoint) =>
                viewpoint.snapshot_object_key
                  ? [viewpoint.snapshot_object_key]
                  : [],
              ),
              ...artifacts.flatMap((artifact) => [
                artifact.metadata_object_key,
                artifact.hierarchy_object_key,
                artifact.octree_object_key,
              ]),
            ],
            available_at: requestedAt,
          },
        ],
        skipDuplicates: true,
      });

      return assets.map((asset) => asset.id);
    });
  }
}
