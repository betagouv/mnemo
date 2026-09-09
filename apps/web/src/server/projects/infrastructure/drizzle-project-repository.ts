import type { CreateProjectInput } from "@mnemo/contracts/projects";
import { projectMembers, projects, type MnemoDatabase } from "@mnemo/database";
import { and, desc, eq, isNull } from "drizzle-orm";

import type {
  ProjectForActor,
  ProjectRepository,
} from "../application/project-repository";

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly database: MnemoDatabase) {}

  async listForActor(actorId: string): Promise<ProjectForActor[]> {
    return this.database
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        role: projectMembers.role,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(
        and(eq(projectMembers.userId, actorId), isNull(projects.archivedAt)),
      )
      .orderBy(desc(projects.updatedAt));
  }

  async findForActor(
    actorId: string,
    projectId: string,
  ): Promise<ProjectForActor | undefined> {
    const [project] = await this.database
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        role: projectMembers.role,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(
        and(
          eq(projectMembers.userId, actorId),
          eq(projects.id, projectId),
          isNull(projects.archivedAt),
        ),
      )
      .limit(1);

    return project;
  }

  async createForActor(
    actorId: string,
    input: CreateProjectInput,
  ): Promise<ProjectForActor> {
    return this.database.transaction(async (transaction) => {
      const [project] = await transaction
        .insert(projects)
        .values({
          name: input.name,
          description: input.description || null,
          createdBy: actorId,
        })
        .returning();

      if (!project) {
        throw new Error("Project insertion returned no record");
      }

      await transaction.insert(projectMembers).values({
        projectId: project.id,
        userId: actorId,
        role: "owner",
      });

      return {
        id: project.id,
        name: project.name,
        description: project.description,
        role: "owner",
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };
    });
  }
}
