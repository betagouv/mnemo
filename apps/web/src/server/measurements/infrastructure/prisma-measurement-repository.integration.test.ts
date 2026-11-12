import { PrismaFloorPlanRepository } from "@/server/floor-plans/infrastructure/prisma-floor-plan-repository";
import { FloorPlanSourceError } from "@/server/floor-plans/application/floor-plan-repository";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createPrismaDatabase } from "@mnemo/database";
import type { SaveMeasurementInput } from "@mnemo/contracts/measurements";
import { PrismaProjectRepository } from "@/server/projects/infrastructure/prisma-project-repository";
import {
  MeasurementService,
  MeasurementAccessDeniedError,
} from "../application/measurement-service";
import {
  MeasurementConflictError,
  MeasurementPlanError,
} from "../application/measurement-repository";
import { PrismaMeasurementRepository } from "./prisma-measurement-repository";
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
  planId = randomUUID(),
  assetId = randomUUID();
const service = new MeasurementService(
  new PrismaProjectRepository(db),
  new PrismaMeasurementRepository(db),
);
function input(): SaveMeasurementInput {
  return {
    id: randomUUID(),
    projectId,
    floorPlanId: null,
    kind: "distance",
    name: "Largeur",
    points: [
      { x: 700000, y: 6600000, z: 100 },
      { x: 700004, y: 6600000, z: 100 },
    ],
  };
}

describe("shared project measurements", () => {
  beforeAll(async () => {
    for (const id of [owner, reader, outsider])
      await db.users.create({
        data: {
          id,
          email: `${id}@test.mnemo.local`,
          display_name: "Measurement actor",
        },
      });
    for (const id of [projectId, otherProject])
      await db.projects.create({
        data: {
          id,
          title: "Measures",
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
        original_file_name: "test.ifc",
        media_type: "application/octet-stream",
        size_bytes: 1n,
        original_object_key: `test/${assetId}`,
        status: "ready",
        created_by: owner,
        upload_expires_at: new Date("2030-01-01"),
      },
    });
    await db.project_floor_plans.create({
      data: {
        id: planId,
        project_id: projectId,
        asset_id: assetId,
        name: "RDC",
        storey_id: 1,
        storey_name: "RDC",
        style: { preset: "default", rules: [] },
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
  it("shares exact coordinates and preserves the original author on edit", async () => {
    const measurement = await service.save(owner, input());
    expect(await service.list(reader, projectId)).toContainEqual(measurement);
    const updated = await service.save(owner, {
      ...measurement,
      name: "Largeur façade",
    });
    expect(updated).toMatchObject({
      createdBy: owner,
      version: 2,
      points: measurement.points,
    });
  });
  it("rejects outsiders, read-only writes, deletes and cross-project identifiers", async () => {
    const measurement = await service.save(owner, input());
    await expect(service.list(outsider, projectId)).rejects.toBeInstanceOf(
      MeasurementAccessDeniedError,
    );
    await expect(service.save(reader, input())).rejects.toBeInstanceOf(
      MeasurementAccessDeniedError,
    );
    await expect(service.delete(reader, measurement)).rejects.toBeInstanceOf(
      MeasurementAccessDeniedError,
    );
    await expect(
      service.save(owner, { ...measurement, projectId: otherProject }),
    ).rejects.toBeInstanceOf(MeasurementConflictError);
    await expect(
      service.delete(owner, { ...measurement, projectId: otherProject }),
    ).rejects.toBeInstanceOf(MeasurementConflictError);
    await expect(
      service.save(owner, {
        ...input(),
        projectId: otherProject,
        floorPlanId: planId,
      }),
    ).rejects.toBeInstanceOf(MeasurementPlanError);
  });
  it("retries creation without duplicating a measurement", async () => {
    const data = input();
    const measurement = await service.save(owner, data);
    expect(await service.save(owner, data)).toEqual(measurement);
    await expect(
      service.save(owner, { ...data, name: "Different" }),
    ).rejects.toBeInstanceOf(MeasurementConflictError);
  });
  it("rejects invalid points, degenerate distances and nonplanar contours", async () => {
    const data = input();
    await expect(
      service.save(owner, {
        ...data,
        points: [data.points[0]!, data.points[0]!],
      }),
    ).rejects.toThrow();
    await expect(
      service.save(owner, {
        ...data,
        points: [data.points[0]!, { x: NaN, y: 0, z: 0 }],
      }),
    ).rejects.toThrow();
    await expect(
      service.save(owner, {
        ...data,
        kind: "surface",
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 4, y: 0, z: 0 },
          { x: 4, y: 4, z: 0 },
          { x: 0, y: 4, z: 1 },
        ],
      }),
    ).rejects.toThrow();
  });
  it("rejects surfaces attached to a plan while plan measurements support distances", async () => {
    await expect(
      service.save(owner, {
        ...input(),
        floorPlanId: planId,
        kind: "surface",
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 4, y: 0, z: 0 },
          { x: 4, y: 4, z: 0 },
        ],
      }),
    ).rejects.toThrow("mesures de distance");
  });
  it("prevents lost updates and stale deletion", async () => {
    const measurement = await service.save(owner, input());
    const results = await Promise.allSettled([
      service.save(owner, { ...measurement, name: "A" }),
      service.save(owner, { ...measurement, name: "B" }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expect(service.delete(owner, measurement)).rejects.toBeInstanceOf(
      MeasurementConflictError,
    );
  });
  it("removes measurements with their plan and project", async () => {
    const measurement = await service.save(owner, {
      ...input(),
      floorPlanId: planId,
    });
    const plans = new PrismaFloorPlanRepository(db);
    const planInput = {
      projectId,
      assetId,
      name: "RDC",
      storeyName: "RDC",
      storeyId: 2,
      style: { preset: "default" as const, rules: [] },
      target: { id: planId, version: 1 },
    };
    await expect(plans.save(planInput)).rejects.toBeInstanceOf(
      FloorPlanSourceError,
    );
    expect(
      (
        await db.project_floor_plans.findUniqueOrThrow({
          where: { id: planId },
        })
      ).storey_id,
    ).toBe(1);
    await plans.save({ ...planInput, storeyId: 1, name: "RDC renommé" });
    await db.project_floor_plans.delete({ where: { id: planId } });
    expect(
      await db.project_measurements.findUnique({
        where: { id: measurement.id },
      }),
    ).toBeNull();
    const other = await service.save(owner, {
      ...input(),
      projectId: otherProject,
    });
    await db.projects.delete({ where: { id: otherProject } });
    expect(
      await db.project_measurements.findUnique({ where: { id: other.id } }),
    ).toBeNull();
  });
});
