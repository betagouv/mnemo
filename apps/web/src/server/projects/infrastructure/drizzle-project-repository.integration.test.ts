import { randomUUID } from "node:crypto";

import { createDatabase, projects, users } from "@mnemo/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DrizzleProjectRepository } from "./drizzle-project-repository";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for project integration tests");
}

const database = createDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const actorId = randomUUID();
const otherActorId = randomUUID();

describe("DrizzleProjectRepository", () => {
  beforeAll(async () => {
    await database.db.insert(users).values([
      {
        id: actorId,
        email: `${actorId}@test.mnemo.local`,
        displayName: "Repository test actor",
      },
      {
        id: otherActorId,
        email: `${otherActorId}@test.mnemo.local`,
        displayName: "Unrelated actor",
      },
    ]);
  });

  afterAll(async () => {
    await database.db.delete(projects).where(eq(projects.createdBy, actorId));
    await database.db.delete(users).where(eq(users.id, actorId));
    await database.db.delete(users).where(eq(users.id, otherActorId));
    await database.close();
  });

  it("creates an owner membership and lists it for the actor", async () => {
    const repository = new DrizzleProjectRepository(database.db);

    const created = await repository.createForActor(actorId, {
      name: "Projet dépôt",
      description: "Transaction atomique",
    });

    expect(created.role).toBe("owner");
    await expect(repository.listForActor(actorId)).resolves.toContainEqual(
      created,
    );
    await expect(repository.findForActor(actorId, created.id)).resolves.toEqual(
      created,
    );
    await expect(
      repository.findForActor(otherActorId, created.id),
    ).resolves.toBeUndefined();
  });
});
