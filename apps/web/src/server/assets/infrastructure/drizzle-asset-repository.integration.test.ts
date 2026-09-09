import { randomUUID } from "node:crypto";

import {
  assets,
  createDatabase,
  projectMembers,
  projects,
  users,
} from "@mnemo/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DrizzleAssetRepository } from "./drizzle-asset-repository";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for asset integration tests");
}

const database = createDatabase({
  connectionString: databaseUrl,
  maxConnections: 1,
});
const actorId = randomUUID();
const projectId = randomUUID();
const assetId = randomUUID();

describe("DrizzleAssetRepository", () => {
  beforeAll(async () => {
    await database.db.insert(users).values({
      id: actorId,
      email: `${actorId}@test.mnemo.local`,
      displayName: "Asset repository actor",
    });
    await database.db.insert(projects).values({
      id: projectId,
      name: "Asset repository project",
      createdBy: actorId,
    });
    await database.db.insert(projectMembers).values({
      projectId,
      userId: actorId,
      role: "owner",
    });
  });

  afterAll(async () => {
    await database.db.delete(projects).where(eq(projects.id, projectId));
    await database.db.delete(users).where(eq(users.id, actorId));
    await database.close();
  });

  it("persists, scopes and completes an original upload", async () => {
    const repository = new DrizzleAssetRepository(database.db);
    const expiresAt = new Date(Date.now() + 60_000);
    const pending = await repository.createPending({
      id: assetId,
      projectId,
      kind: "ifc",
      originalFileName: "model.ifc",
      mediaType: "application/x-step",
      sizeBytes: 42,
      originalObjectKey: `projects/${projectId}/assets/${assetId}/original.ifc`,
      uploadExpiresAt: expiresAt,
      createdBy: actorId,
    });

    expect(pending.status).toBe("upload_pending");
    await expect(repository.listForActor(actorId, projectId)).resolves.toEqual([
      pending,
    ]);
    await expect(
      repository.findForActor(actorId, projectId, assetId),
    ).resolves.toMatchObject({ role: "owner", asset: pending });

    const completed = await repository.markUploaded(assetId, new Date());
    expect(completed.status).toBe("uploaded");
    await expect(
      database.db.select().from(assets).where(eq(assets.id, assetId)),
    ).resolves.toHaveLength(1);
  });
});
