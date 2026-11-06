import { randomUUID } from "node:crypto";
import { createPrismaDatabase } from "@mnemo/database";
import type { SaveFloorPlanInput } from "@mnemo/contracts/floor-plans";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaProjectRepository } from "@/server/projects/infrastructure/prisma-project-repository";
import {
  FloorPlanService,
  FloorPlanAccessDeniedError,
} from "../application/floor-plan-service";
import {
  FloorPlanConflictError,
  FloorPlanSourceError,
} from "../application/floor-plan-repository";
import { PrismaFloorPlanRepository } from "./prisma-floor-plan-repository";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const database = createPrismaDatabase({
  connectionString: process.env.DATABASE_URL,
  maxConnections: 3,
});
const db = database.db;
const owner = randomUUID(),
  reader = randomUUID(),
  outsider = randomUUID();
const projectId = randomUUID(),
  otherProject = randomUUID(),
  assetId = randomUUID();
const repository = new PrismaFloorPlanRepository(db);
const service = new FloorPlanService(
  new PrismaProjectRepository(db),
  repository,
);
const input: SaveFloorPlanInput = {
  projectId,
  assetId,
  name: "RDC",
  storeyId: 42,
  storeyName: "Ground Floor",
  style: {
    preset: "architectural",
    rules: [
      {
        id: randomUUID(),
        name: "Murs",
        enabled: true,
        ifcType: "IfcWall",
        fillColor: "#ff0000",
        strokeColor: "#000000",
        lineWeight: 0.35,
      },
    ],
  },
};

describe("project floor plans", () => {
  beforeAll(async () => {
    for (const id of [owner, reader, outsider])
      await db.users.create({
        data: {
          id,
          email: `${id}@test.mnemo.local`,
          display_name: "Plan actor",
        },
      });
    for (const id of [projectId, otherProject])
      await db.projects.create({
        data: {
          id,
          title: "Plans",
          created_by: owner,
          project_members: {
            create: [
              { user_id: owner, role: "owner" },
              { user_id: reader, role: "viewer" },
            ],
          },
        },
      });
    await db.assets.create({
      data: {
        id: assetId,
        project_id: projectId,
        kind: "ifc",
        original_file_name: "plan.ifc",
        media_type: "application/octet-stream",
        size_bytes: 42n,
        original_object_key: `test/${assetId}`,
        status: "ready",
        created_by: owner,
        upload_expires_at: new Date("2030-01-01"),
      },
    });
  });
  afterAll(async () => {
    await db.projects.deleteMany({
      where: { id: { in: [projectId, otherProject] } },
    });
    await db.users.deleteMany({
      where: { id: { in: [owner, reader, outsider] } },
    });
    await database.close();
  });
  it("round trips style rules and shares read access with project members", async () => {
    const plan = await service.save(owner, input);
    expect(await service.list(reader, projectId)).toEqual([plan]);
    expect(plan).toMatchObject({ ...input, version: 1 });
  });
  it("rejects outsiders, read-only writes and invalid inputs", async () => {
    await expect(service.list(outsider, projectId)).rejects.toBeInstanceOf(
      FloorPlanAccessDeniedError,
    );
    await expect(service.save(reader, input)).rejects.toBeInstanceOf(
      FloorPlanAccessDeniedError,
    );
    await expect(
      service.save(owner, {
        ...input,
        style: {
          ...input.style,
          rules: [{ ...input.style.rules[0], fillColor: "url(evil)" }],
        },
      }),
    ).rejects.toThrow();
  });
  it("rejects assets and view identifiers from other projects", async () => {
    const plan = await service.save(owner, input);
    await expect(
      service.save(owner, { ...input, projectId: otherProject }),
    ).rejects.toBeInstanceOf(FloorPlanSourceError);
    await expect(
      service.delete(owner, {
        projectId: otherProject,
        id: plan.id,
        version: plan.version,
      }),
    ).rejects.toBeInstanceOf(FloorPlanConflictError);
    await expect(
      service.delete(reader, { projectId, id: plan.id, version: plan.version }),
    ).rejects.toBeInstanceOf(FloorPlanAccessDeniedError);
  });
  it("prevents concurrent lost updates and stale deletion", async () => {
    const plan = await service.save(owner, input);
    const update = { ...input, target: { id: plan.id, version: plan.version } };
    const outcomes = await Promise.allSettled([
      service.save(owner, { ...update, name: "A" }),
      service.save(owner, { ...update, name: "B" }),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expect(
      service.delete(owner, { projectId, id: plan.id, version: 1 }),
    ).rejects.toBeInstanceOf(FloorPlanConflictError);
    await service.delete(owner, { projectId, id: plan.id, version: 2 });
    expect(
      (await service.list(reader, projectId)).some(
        (item) => item.id === plan.id,
      ),
    ).toBe(false);
  });
  it("cascades saved views when their IFC source is deleted", async () => {
    await service.save(owner, input);
    await db.assets.delete({ where: { id: assetId } });
    expect(await service.list(owner, projectId)).toEqual([]);
  });
});
