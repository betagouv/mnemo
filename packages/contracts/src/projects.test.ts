import { describe, expect, it } from "vitest";

import { createProjectInputSchema, projectSummarySchema } from "./projects";

describe("project contracts", () => {
  it("normalizes a project creation request", () => {
    expect(
      createProjectInputSchema.parse({
        name: "  Restauration de la chapelle  ",
        description: "  Relevé 2026  ",
      }),
    ).toEqual({
      name: "Restauration de la chapelle",
      description: "Relevé 2026",
    });
  });

  it("rejects an invalid project response date", () => {
    expect(() =>
      projectSummarySchema.parse({
        id: "bb668746-147b-4e44-bcd8-307e3869d7f2",
        name: "Projet test",
        description: null,
        role: "owner",
        createdAt: "yesterday",
        updatedAt: "2026-09-09T10:00:00.000Z",
      }),
    ).toThrow();
  });
});
