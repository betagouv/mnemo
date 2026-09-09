import { describe, expect, it } from "vitest";

import {
  bcfArchiveImportResultSchema,
  bcfViewpointPayloadSchema,
  createBcfTopicInputSchema,
  updateBcfTopicStatusInputSchema,
} from "./bcf";

describe("BCF contracts", () => {
  it("validates bounded BCF archive import summaries", () => {
    expect(
      bcfArchiveImportResultSchema.parse({
        topics: [],
        imported: { topics: 1, comments: 2, viewpoints: 3, snapshots: 1 },
        skippedTopics: 0,
        warnings: [],
      }).imported.viewpoints,
    ).toBe(3);
  });

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

  it("requires exactly one finite camera in a BCF viewpoint", () => {
    const perspective = {
      cameraViewPoint: { x: 1, y: 2, z: 3 },
      cameraDirection: { x: 0, y: 0, z: -1 },
      cameraUpVector: { x: 0, y: 1, z: 0 },
      fieldOfView: 50,
      aspectRatio: 16 / 9,
    };

    expect(
      bcfViewpointPayloadSchema.parse({
        guid: "02609803-f2a6-4a1a-971c-bc579e28ea98",
        perspectiveCamera: perspective,
      }),
    ).toMatchObject({ perspectiveCamera: perspective });
    expect(() =>
      bcfViewpointPayloadSchema.parse({
        guid: "02609803-f2a6-4a1a-971c-bc579e28ea98",
      }),
    ).toThrow("exactly one camera");
  });
});
