import { afterEach, describe, expect, it, vi } from "vitest";

import { getPointCloudOneOffConfig } from "./runtime-config";

const job = {
  jobId: "b54fa726-f8fc-4d94-a8fc-c0e1cc8cf14b",
  attempt: 1,
  assetId: "89ebfdf2-3cc9-482c-aa28-71a20de7f519",
  projectId: "443a366b-3850-48d8-b7e5-25fd5e0c5045",
  originalFileName: "scan.laz",
  originalObjectKey: "projects/test/original.laz",
  sizeBytes: 100,
};

function stubRequiredEnvironment() {
  vi.stubEnv("MNEMO_POINT_CLOUD_JOB", JSON.stringify(job));
  vi.stubEnv("S3_ENDPOINT", "https://s3.example.test");
  vi.stubEnv("S3_REGION", "eu-west-par");
  vi.stubEnv("S3_BUCKET", "mnemo");
  vi.stubEnv("S3_ACCESS_KEY", "access-key");
  vi.stubEnv("S3_SECRET_KEY", "secret-key");
}

describe("point-cloud one-off configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses packaged Untwine for COPC unless overridden", () => {
    stubRequiredEnvironment();
    vi.stubEnv("UNTWINE_PATH", "");
    expect(getPointCloudOneOffConfig().untwinePath).toMatch(/\/bin\/untwine$/);

    vi.stubEnv("UNTWINE_PATH", "/opt/copc/untwine");
    expect(getPointCloudOneOffConfig().untwinePath).toBe("/opt/copc/untwine");
  });
});
