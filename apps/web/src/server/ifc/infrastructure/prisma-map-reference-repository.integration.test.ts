import { randomUUID } from "node:crypto";
import type { ProjectMapReference } from "@mnemo/contracts/map-reference";
import { createPrismaDatabase } from "@mnemo/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaAssetRepository } from "@/server/assets/infrastructure/prisma-asset-repository";
import { PrismaProjectRepository } from "@/server/projects/infrastructure/prisma-project-repository";
import {
  MapReferenceAccessDeniedError,
  MapReferenceService,
} from "../application/map-reference-service";
import { PrismaMapReferenceRepository } from "./prisma-map-reference-repository";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const database = createPrismaDatabase({
  connectionString: process.env.DATABASE_URL,
  maxConnections: 3,
});
const { db } = database;
const owner = randomUUID();
const reader = randomUUID();
const outsider = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
let assetId: string;
const service = new MapReferenceService(
  new PrismaProjectRepository(db),
  new PrismaMapReferenceRepository(db),
);

async function createIfc(project = projectId) {
  const id = randomUUID();
  await db.assets.create({
    data: {
      id,
      project_id: project,
      kind: "ifc",
      original_file_name: "Maquette.ifc",
      media_type: "application/octet-stream",
      size_bytes: 1n,
      original_object_key: `projects/${project}/assets/${id}/original.ifc`,
      status: "ready",
      created_by: owner,
      upload_expires_at: new Date(),
    },
  });
  return id;
}
const reference = (eastings = 652310.718): ProjectMapReference => ({
  assetId,
  crs: "EPSG:2154",
  verticalDatum: null,
  eastings,
  northings: 6862414.6367615201,
  orthogonalHeight: 42,
  xAxisAbscissa: 1,
  xAxisOrdinate: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
});

describe("project map reference", () => {
  beforeAll(async () => {
    for (const id of [owner, reader, outsider])
      await db.users.create({
        data: {
          id,
          email: `${id}@test.mnemo.local`,
          display_name: "Map reference actor",
        },
      });
    for (const id of [projectId, otherProjectId])
      await db.projects.create({
        data: {
          id,
          title: "Repère",
          created_by: owner,
          project_members: {
            create: [
              { user_id: owner, role: "owner" },
              { user_id: reader, role: "viewer" },
            ],
          },
        },
      });
  });
  beforeEach(async () => {
    await db.project_map_references.deleteMany({
      where: { project_id: projectId },
    });
    assetId = await createIfc();
  });
  afterAll(async () => {
    await db.projects.deleteMany({
      where: { id: { in: [projectId, otherProjectId] } },
    });
    await db.users.deleteMany({
      where: { id: { in: [owner, reader, outsider] } },
    });
    await database.close();
  });

  it("gives every session the frame that was pinned first", async () => {
    const [first, second] = await Promise.all([
      service.pin(owner, { projectId, reference: reference() }),
      service.pin(owner, { projectId, reference: reference(1_000) }),
    ]);
    expect(second).toEqual(first);
    expect(await service.find(reader, projectId)).toEqual(first);
    expect(
      await service.pin(owner, { projectId, reference: reference(2_000) }),
    ).toEqual(first);
  });

  it("preserves coordinate precision", async () => {
    expect(
      await service.pin(owner, { projectId, reference: reference() }),
    ).toEqual(reference());
  });

  it("does not let readers define the project frame", async () => {
    expect(
      await service.pin(reader, { projectId, reference: reference() }),
    ).toEqual(reference());
    expect(await service.find(owner, projectId)).toBeNull();
    await expect(
      service.pin(outsider, { projectId, reference: reference() }),
    ).rejects.toBeInstanceOf(MapReferenceAccessDeniedError);
    await expect(service.find(outsider, projectId)).rejects.toBeInstanceOf(
      MapReferenceAccessDeniedError,
    );
  });

  it("ignores a reference asset from another project", async () => {
    const foreign = await createIfc(otherProjectId);
    expect(
      await service.pin(owner, {
        projectId,
        reference: { ...reference(), assetId: foreign },
      }),
    ).toMatchObject({ assetId: null });
  });

  it("forgets the frame with its model when nothing was saved in it", async () => {
    await service.pin(owner, { projectId, reference: reference() });
    await new PrismaAssetRepository(db).requestDeletion(assetId, new Date());
    expect(await service.find(owner, projectId)).toBeNull();
  });

  it("keeps the frame of saved measurements when its model is deleted", async () => {
    await service.pin(owner, { projectId, reference: reference() });
    const measurement = await db.project_measurements.create({
      data: {
        project_id: projectId,
        created_by: owner,
        name: "Largeur",
        kind: "distance",
        points: [],
      },
    });
    await new PrismaAssetRepository(db).requestDeletion(assetId, new Date());
    await db.assets.delete({ where: { id: assetId } });
    expect(await service.find(owner, projectId)).toEqual({
      ...reference(),
      assetId: null,
    });
    await db.project_measurements.delete({ where: { id: measurement.id } });
  });
});
