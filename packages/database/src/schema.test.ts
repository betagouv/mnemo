import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  assetKindEnum,
  assetProcessingResults,
  assets,
  assetStatusEnum,
  deletionJobs,
  deletionJobTypeEnum,
  processingJobs,
  pointCloudSettings,
  processingJobStatusEnum,
  processingJobTypeEnum,
  projectMembers,
  projectRoleEnum,
  projects,
  users,
} from "./schema";

describe("database schema", () => {
  it("keeps project access in an explicit membership table", () => {
    expect(getTableName(users)).toBe("users");
    expect(getTableName(projects)).toBe("projects");
    expect(getTableName(projectMembers)).toBe("project_members");
  });

  it("persists only supported project roles", () => {
    expect(projectRoleEnum.enumValues).toEqual(["owner", "editor", "viewer"]);
  });

  it("tracks original asset ownership and processing state", () => {
    expect(getTableName(assets)).toBe("assets");
    expect(assetKindEnum.enumValues).toEqual(["ifc", "point_cloud"]);
    expect(assetStatusEnum.enumValues).toContain("upload_pending");
    expect(assetStatusEnum.enumValues).toContain("ready");
  });

  it("persists retryable processing jobs", () => {
    expect(getTableName(processingJobs)).toBe("processing_jobs");
    expect(processingJobTypeEnum.enumValues).toEqual([
      "process_ifc",
      "process_point_cloud",
    ]);
    expect(processingJobStatusEnum.enumValues).toEqual([
      "queued",
      "running",
      "succeeded",
      "failed",
    ]);
  });

  it("persists the latest disposable IFC processing cache reference", () => {
    expect(getTableName(assetProcessingResults)).toBe(
      "asset_processing_results",
    );
  });

  it("persists point-cloud alignment independently from render controls", () => {
    expect(getTableName(pointCloudSettings)).toBe("point_cloud_settings");
  });

  it("keeps cleanup jobs independent from resources being deleted", () => {
    expect(getTableName(deletionJobs)).toBe("deletion_jobs");
    expect(deletionJobTypeEnum.enumValues).toEqual([
      "delete_asset",
      "delete_project",
    ]);
  });
});
