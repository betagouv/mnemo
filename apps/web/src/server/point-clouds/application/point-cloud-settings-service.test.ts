import type { UpdatePointCloudSettingsInput } from "@mnemo/contracts/point-clouds";
import { describe, expect, it } from "vitest";

import type { PointCloudSettingsRepository } from "./point-cloud-settings-repository";
import {
  PointCloudSettingsAccessDeniedError,
  PointCloudSettingsService,
} from "./point-cloud-settings-service";

const input: UpdatePointCloudSettingsInput = {
  projectId: "d14ccec4-b8c9-437e-89af-0690c9c9682b",
  assetId: "95378a63-f613-46ce-ac24-3b7ea5a40ace",
  transform: {
    position: [1, 2, 3],
    rotationDegrees: [-90, 0, 0],
    scale: [1, 1, 1],
  },
  sourceCrs: "EPSG:2154",
  targetCrs: null,
};

function createRepository(
  role: "owner" | "editor" | "viewer" = "owner",
): PointCloudSettingsRepository {
  return {
    findForActor: async () => ({
      assetId: input.assetId,
      kind: "point_cloud",
      role,
      settings: null,
    }),
    save: async (_actorId, saved, updatedAt) => ({
      assetId: saved.assetId,
      transform: saved.transform,
      sourceCrs: saved.sourceCrs,
      targetCrs: saved.targetCrs,
      updatedAt: updatedAt.toISOString(),
    }),
  };
}

describe("PointCloudSettingsService", () => {
  it("returns a Z-up to Y-up default without creating a record", async () => {
    await expect(
      new PointCloudSettingsService(createRepository()).get("actor", input),
    ).resolves.toMatchObject({
      assetId: input.assetId,
      transform: { rotationDegrees: [-90, 0, 0] },
      updatedAt: null,
    });
  });

  it("persists an editor alignment", async () => {
    const service = new PointCloudSettingsService(
      createRepository("editor"),
      () => new Date("2026-09-09T18:00:00.000Z"),
    );

    await expect(service.update("actor", input)).resolves.toMatchObject({
      transform: input.transform,
      sourceCrs: "EPSG:2154",
      updatedAt: "2026-09-09T18:00:00.000Z",
    });
  });

  it("prevents viewers from changing project alignment", async () => {
    await expect(
      new PointCloudSettingsService(createRepository("viewer")).update(
        "actor",
        input,
      ),
    ).rejects.toBeInstanceOf(PointCloudSettingsAccessDeniedError);
  });
});
