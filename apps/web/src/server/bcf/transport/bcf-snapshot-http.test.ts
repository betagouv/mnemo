import { describe, it, expect, vi } from "vitest";
import { bcfSnapshotResponse } from "./bcf-snapshot-http";
import {
  BcfTopicAccessDeniedError,
  BcfTopicNotFoundError,
} from "../application/bcf-topic-errors";
const params = {
  projectId: "d14ccec4-b8c9-437e-89af-0690c9c9682b",
  topicId: "a805b627-40b3-45c1-9d13-91042c67f025",
  viewpointId: "9f313504-b442-4df1-97d5-c6451f5d8c80",
};
describe("private BCF image delivery", () => {
  it("redirects an authorized request to a fresh signed URL without caching it", async () => {
    const service = {
      snapshotUrl: vi.fn(
        async () => "https://storage.local/image?signature=fresh",
      ),
    };
    const response = await bcfSnapshotResponse({
      actorId: "actor",
      params,
      service,
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("signature=fresh");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(service.snapshotUrl).toHaveBeenCalledWith(
      "actor",
      params.projectId,
      params.topicId,
      params.viewpointId,
    );
  });
  it.each([
    [new BcfTopicAccessDeniedError("Denied"), 403],
    [new BcfTopicNotFoundError("Missing"), 404],
  ] as const)(
    "does not expose storage links on errors",
    async (error, status) => {
      const response = await bcfSnapshotResponse({
        actorId: "outsider",
        params,
        service: {
          snapshotUrl: vi.fn(async () => {
            throw error;
          }),
        },
      });
      expect(response.status).toBe(status);
      expect(response.headers.has("location")).toBe(false);
    },
  );
});
