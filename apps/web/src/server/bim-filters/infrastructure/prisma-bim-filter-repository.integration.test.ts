import { randomUUID } from "node:crypto";
import { createPrismaDatabase } from "@mnemo/database";
import type { SaveBimFiltersInput } from "@mnemo/contracts/bim-filters";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaProjectRepository } from "@/server/projects/infrastructure/prisma-project-repository";
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
  maxConnections: 3,
});
const db = database.db;
const owner = randomUUID(),
  reader = randomUUID(),
  outsider = randomUUID();
const projectId = randomUUID(),
  otherProject = randomUUID(),
  assetId = randomUUID();
const service = new BimFilterService(
  new PrismaProjectRepository(db),
  new PrismaBimFilterRepository(db),
);
const input: SaveBimFiltersInput = {
  projectId,
  assetId,
  version: 0,
  settings: {
    showContext: true,
    contextOpacity: 0.18,
    groups: [
      {
        id: randomUUID(),
        name: "Structure",
        enabled: false,
        rules: [
          {
            id: randomUUID(),
            enabled: true,
            action: "isolate",
            query: { ifcClasses: ["IfcWall"], storeyIds: [42] },
            color: "#6a6af4",
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
    upload_expires_at: new Date("2030-01-01"),
  };
}

describe("model BIM filters", () => {
  beforeAll(async () => {
    for (const id of [owner, reader, outsider])
      await db.users.create({
        data: {
          id,
          email: `${id}@test.mnemo.local`,
          display_name: "Filter actor",
        },
      });
    for (const id of [projectId, otherProject])
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
    await db.assets.create({ data: assetData(assetId) });
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
  it("round trips names, criteria and independent activation flags", async () => {
    const filters = await service.save(owner, input);
    expect(filters).toEqual({ assetId, version: 1, settings: input.settings });
    expect(await service.list(reader, projectId)).toEqual([filters]);
  });
  it("rejects outsiders, reader writes and malformed settings", async () => {
    await expect(service.list(outsider, projectId)).rejects.toBeInstanceOf(
      BimFilterAccessDeniedError,
    );
    await expect(service.save(outsider, input)).rejects.toBeInstanceOf(
      BimFilterAccessDeniedError,
    );
    await expect(service.save(reader, input)).rejects.toBeInstanceOf(
      BimFilterAccessDeniedError,
    );
    await expect(
      service.save(owner, {
        ...input,
        settings: { ...input.settings, contextOpacity: 9 },
      }),
    ).rejects.toThrow();
  });
  it("scopes assets to their project and excludes unavailable sources", async () => {
    await expect(
      service.save(owner, { ...input, projectId: otherProject }),
    ).rejects.toBeInstanceOf(BimFilterSourceError);
    expect(await service.list(reader, otherProject)).toEqual([]);
    const pendingId = randomUUID();
    await db.assets.create({
      data: { ...assetData(pendingId), status: "upload_pending" },
    });
    await expect(
      service.save(owner, { ...input, assetId: pendingId }),
    ).rejects.toBeInstanceOf(BimFilterSourceError);
    const cloudId = randomUUID();
    await db.assets.create({
      data: { ...assetData(cloudId), kind: "point_cloud" },
    });
    await expect(
      service.save(owner, { ...input, assetId: cloudId }),
    ).rejects.toBeInstanceOf(BimFilterSourceError);
  });
  it("prevents concurrent first writes and stale replacement", async () => {
    const freshId = randomUUID();
    await db.assets.create({ data: assetData(freshId) });
    const fresh = { ...input, assetId: freshId };
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
    expect(
      outcomes.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expect(service.save(owner, update)).rejects.toBeInstanceOf(
      BimFilterConflictError,
    );
    expect(
      (await service.list(reader, projectId)).find(
        (item) => item.assetId === freshId,
      )?.version,
    ).toBe(2);
  });
  it("cascades settings when an IFC asset is deleted", async () => {
    await db.assets.delete({ where: { id: assetId } });
    expect(
      (await service.list(owner, projectId)).some(
        (item) => item.assetId === assetId,
      ),
    ).toBe(false);
  });
});
