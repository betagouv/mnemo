import { randomUUID } from "node:crypto";
import { createPrismaDatabase } from "@mnemo/database";
import type { SaveBimFiltersInput } from "@mnemo/contracts/bim-filters";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaProjectRepository } from "@/server/projects/infrastructure/prisma-project-repository";
import { PrismaAssetRepository } from "@/server/assets/infrastructure/prisma-asset-repository";
import {
  BimFilterService,
  BimFilterAccessDeniedError,
} from "../application/bim-filter-service";
import {
  BimFilterConflictError,
  BimFilterSourceError,
} from "../application/bim-filter-repository";
import { PrismaBimFilterRepository } from "./prisma-bim-filter-repository";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const database = createPrismaDatabase({
  connectionString: process.env.DATABASE_URL,
  maxConnections: 4,
});
const db = database.db;
const owner = randomUUID(),
  reader = randomUUID(),
  outsider = randomUUID();
const projectId = randomUUID(),
  otherProject = randomUUID(),
  freshProject = randomUUID();
const assetId = randomUUID(),
  secondAsset = randomUUID(),
  pendingId = randomUUID(),
  cloudId = randomUUID();
const service = new BimFilterService(
  new PrismaProjectRepository(db),
  new PrismaBimFilterRepository(db),
);
const assets = new PrismaAssetRepository(db);
const input: SaveBimFiltersInput = {
  projectId,
  version: 0,
  settings: {
    showContext: true,
    contextOpacity: 0.18,
    groups: [
      {
        id: randomUUID(),
        name: "Structure",
        enabled: true,
        assetIds: [assetId, secondAsset],
        rules: [
          {
            id: randomUUID(),
            enabled: true,
            action: "isolate",
            query: {
              ifcClasses: ["IfcWall"],
              storeys: [
                { assetId, storeyId: 42 },
                { assetId: secondAsset, storeyId: 42 },
              ],
            },
            color: "#6a6af4",
          },
          {
            id: randomUUID(),
            enabled: true,
            action: "color",
            query: { ifcClasses: [], storeys: [{ assetId, storeyId: 84 }] },
            color: "#ff0000",
          },
        ],
      },
    ],
  },
};
function assetData(id: string) {
  return {
    id,
    project_id: projectId,
    kind: "ifc" as const,
    original_file_name: "model.ifc",
    media_type: "application/octet-stream",
    size_bytes: 42n,
    original_object_key: `test/${id}`,
    status: "ready" as const,
    created_by: owner,
    upload_expires_at: new Date("2035-01-01"),
  };
}

describe("project BIM filters", () => {
  beforeAll(async () => {
    for (const id of [owner, reader, outsider])
      await db.users.create({
        data: {
          id,
          email: `${id}@test.mnemo.local`,
          display_name: "Filter actor",
        },
      });
    for (const id of [projectId, otherProject, freshProject])
      await db.projects.create({
        data: {
          id,
          title: "Filters",
          created_by: owner,
          project_members: {
            create: [
              { user_id: owner, role: "owner" },
              { user_id: reader, role: "viewer" },
            ],
          },
        },
      });
    for (const id of [assetId, secondAsset])
      await db.assets.create({ data: assetData(id) });
    await db.assets.create({
      data: { ...assetData(pendingId), status: "upload_pending" },
    });
    await db.assets.create({
      data: { ...assetData(cloudId), kind: "point_cloud" },
    });
  });
  afterAll(async () => {
    await db.deletion_jobs.deleteMany({
      where: { resource_id: { in: [assetId, secondAsset] } },
    });
    await db.projects.deleteMany({
      where: { id: { in: [projectId, otherProject, freshProject] } },
    });
    await db.users.deleteMany({
      where: { id: { in: [owner, reader, outsider] } },
    });
    await database.close();
  });
  it("round trips groups with multiple targets and model-qualified levels", async () => {
    const filters = await service.save(owner, input);
    expect(filters).toEqual({ ...input, version: 1 });
    expect(await service.get(reader, projectId)).toEqual(filters);
  });
  it("rejects outsiders, reader writes and malformed or out-of-scope levels", async () => {
    await expect(service.get(outsider, projectId)).rejects.toBeInstanceOf(
      BimFilterAccessDeniedError,
    );
    await expect(service.save(reader, input)).rejects.toBeInstanceOf(
      BimFilterAccessDeniedError,
    );
    const invalid = structuredClone(input);
    invalid.settings.groups[0].rules[0].query.storeys[0].assetId = randomUUID();
    await expect(service.save(owner, invalid)).rejects.toThrow();
  });
  it("validates every target against the project and its readiness", async () => {
    await expect(
      service.save(owner, { ...input, projectId: otherProject }),
    ).rejects.toBeInstanceOf(BimFilterSourceError);
    expect(await service.get(reader, otherProject)).toBeNull();
    for (const invalidAssetId of [pendingId, cloudId, randomUUID()]) {
      const invalid = structuredClone(input);
      invalid.settings.groups[0].assetIds.push(invalidAssetId);
      await expect(service.save(owner, invalid)).rejects.toBeInstanceOf(
        BimFilterSourceError,
      );
    }
  });
  it("rejects concurrent first writes and stale replacement versions", async () => {
    const fresh = {
      ...input,
      projectId: freshProject,
      settings: { ...input.settings, groups: [] },
    };
    const first = await Promise.allSettled([
      service.save(owner, fresh),
      service.save(owner, fresh),
    ]);
    expect(
      first.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(first.filter((result) => result.status === "rejected")).toHaveLength(
      1,
    );
    const update = { ...fresh, version: 1 };
    const outcomes = await Promise.allSettled([
      service.save(owner, update),
      service.save(owner, update),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    await expect(service.save(owner, update)).rejects.toBeInstanceOf(
      BimFilterConflictError,
    );
    expect((await service.get(reader, freshProject))?.version).toBe(2);
  });
  it("serializes saving with IFC deletion and removes only the deleted model's references", async () => {
    await Promise.allSettled([
      service.save(owner, { ...input, version: 1 }),
      assets.requestDeletion(assetId, new Date("2035-01-01")),
    ]);
    const filters = (await service.get(reader, projectId))!;
    const group = filters.settings.groups[0];
    expect(group.assetIds).toEqual([secondAsset]);
    expect(group.enabled).toBe(true);
    expect(group.rules[0].query.storeys).toEqual([
      { assetId: secondAsset, storeyId: 42 },
    ]);
    expect(group.rules[1]).toMatchObject({
      enabled: false,
      query: { ifcClasses: [], storeys: [] },
    });
    expect(filters.version).toBeGreaterThan(1);
    await expect(
      service.save(owner, { ...input, version: filters.version }),
    ).rejects.toBeInstanceOf(BimFilterSourceError);
    await assets.requestDeletion(secondAsset, new Date("2035-01-01"));
    const empty = (await service.get(reader, projectId))!.settings.groups[0];
    expect(empty.assetIds).toEqual([]);
    expect(empty.enabled).toBe(false);
    expect(empty.rules).toHaveLength(2);
  });
  it("cascades the configuration when a project is deleted", async () => {
    await db.projects.delete({ where: { id: freshProject } });
    expect(
      await db.project_bim_filters.findUnique({
        where: { project_id: freshProject },
      }),
    ).toBeNull();
  });
});
