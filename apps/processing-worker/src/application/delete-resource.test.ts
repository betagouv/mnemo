import { describe, expect, it, vi } from "vitest";

import { createDeleteResourceHandler } from "./delete-resource";

describe("delete resource", () => {
  it("deletes every stored object before the database record", async () => {
    const operations: string[] = [];
    const handler = createDeleteResourceHandler({
      storage: {
        deleteObject: vi.fn(async (key: string) => {
          operations.push(`object:${key}`);
        }),
      },
      resources: {
        deleteRecord: vi.fn(async () => {
          operations.push("record");
        }),
      },
    });

    await handler({
      id: "job-id",
      type: "delete_project",
      resourceId: "project-id",
      objectKeys: ["original.ifc", "octree/metadata.json"],
      attempt: 1,
      maxAttempts: 5,
    });

    expect(operations).toEqual([
      "object:original.ifc",
      "object:octree/metadata.json",
      "record",
    ]);
  });
});
