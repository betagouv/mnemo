import { describe, expect, it } from "vitest";

import { createProjectInputSchema, projectSummarySchema } from "./projects";

describe("project contracts", () => {
  it("normalizes a project creation request", () => {
    expect(
      createProjectInputSchema.parse({
        title: "  Restauration de la chapelle  ",
        address: "  1 rue du Musée, Paris  ",
        description: "  Relevé 2026  ",
      }),
    ).toEqual({
      title: "Restauration de la chapelle",
      address: "1 rue du Musée, Paris",
      description: "Relevé 2026",
    });
  });

  it("rejects an invalid project response date", () => {
    expect(() =>
      projectSummarySchema.parse({
        id: "bb668746-147b-4e44-bcd8-307e3869d7f2",
        title: "Projet test",
        address: null,
        description: null,
        role: "owner",
        assetCount: 0,
        ifcCount: 0,
        pointCloudCount: 0,
        processingCount: 0,
        failedCount: 0,
        totalSizeBytes: "0",
        createdAt: "yesterday",
        updatedAt: "2026-09-09T10:00:00.000Z",
      }),
    ).toThrow();
  });
});
