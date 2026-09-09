import { describe, expect, it } from "vitest";

import {
  createBcfTopicInputSchema,
  updateBcfTopicStatusInputSchema,
} from "./bcf";

describe("BCF contracts", () => {
  it("normalizes a minimal topic to interoperable application defaults", () => {
    expect(
      createBcfTopicInputSchema.parse({
        projectId: "98a7f2f9-c624-4824-98ad-1999903c3b09",
        title: "  Porte à vérifier  ",
      }),
    ).toMatchObject({
      title: "Porte à vérifier",
      type: "issue",
      priority: "normal",
    });
  });

  it("rejects an unknown topic status", () => {
    expect(() =>
      updateBcfTopicStatusInputSchema.parse({
        projectId: "98a7f2f9-c624-4824-98ad-1999903c3b09",
        topicId: "02609803-f2a6-4a1a-971c-bc579e28ea98",
        status: "done",
      }),
    ).toThrow();
  });
});
