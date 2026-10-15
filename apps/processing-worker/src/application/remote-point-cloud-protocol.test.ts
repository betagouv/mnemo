import { describe, expect, it } from "vitest";

import {
  remotePointCloudJobSchema,
  remotePointCloudOutcomeSchema,
  remotePointCloudPrefix,
} from "./remote-point-cloud-protocol";

const job = {
  jobId: "0291d65a-a810-4ca2-8c27-28f98b11fb94",
  attempt: 1,
  assetId: "e7371b07-6646-4b62-b559-4ced9e1a56d1",
  projectId: "1a6e6575-6179-4096-a50d-96b0950c7760",
  originalFileName: "scan.laz",
  originalObjectKey: "projects/scan/original.laz",
  sizeBytes: 1_000,
};

describe("remote point cloud protocol", () => {
  it("addresses each COPC conversion attempt separately", () => {
    expect(
      remotePointCloudPrefix(remotePointCloudJobSchema.parse(job)),
    ).toContain("/derived/copc-v1/attempts/");
    expect(() =>
      remotePointCloudJobSchema.parse({ ...job, targetFormat: "unsupported" }),
    ).toThrow();
  });

  it("accepts a COPC result with one object key", () => {
    expect(
      remotePointCloudOutcomeSchema.parse({
        jobId: job.jobId,
        attempt: job.attempt,
        status: "succeeded",
        result: {
          format: "copc-v1",
          processor: "Untwine",
          processorVersion: "1.5.1",
          copcObjectKey: "projects/scan/derived/copc-v1/cloud.copc.laz",
          pointCount: 1_800,
          spacing: 0.15,
        },
      }).status,
    ).toBe("succeeded");
  });
});
