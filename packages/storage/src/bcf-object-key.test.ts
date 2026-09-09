import { describe, expect, it } from "vitest";

import { buildBcfViewpointSnapshotKey } from "./bcf-object-key";

describe("buildBcfViewpointSnapshotKey", () => {
  it("keeps a BCF snapshot inside its project and topic prefix", () => {
    expect(
      buildBcfViewpointSnapshotKey({
        projectId: "project-id",
        topicId: "topic-id",
        viewpointId: "viewpoint-id",
        mediaType: "image/png",
      }),
    ).toBe(
      "projects/project-id/bcf/topic-id/viewpoints/viewpoint-id/snapshot.png",
    );
  });
});
