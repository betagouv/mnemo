import { describe, expect, it } from "vitest";

import { processingJobTypeForAsset } from "./processing-job";

describe("processing jobs", () => {
  it("routes assets to their dedicated processor", () => {
    expect(processingJobTypeForAsset("ifc")).toBe("process_ifc");
    expect(processingJobTypeForAsset("point_cloud")).toBe(
      "process_point_cloud",
    );
  });
});
