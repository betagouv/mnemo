import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  assetKindEnum,
  assetProcessingResults,
  assistantMessages,
  assistantThreads,
  assets,
  assetStatusEnum,
  bcfComments,
  bcfPriorityEnum,
  bcfTopicComponents,
  bcfTopics,
  bcfTopicStatusEnum,
  bcfViewpoints,
  deletionJobs,
  deletionJobTypeEnum,
  processingJobs,
  pointCloudSettings,
  pointCloudProcessingResults,
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

  it("persists durable point-cloud octree artifact references", () => {
    expect(getTableName(pointCloudProcessingResults)).toBe(
      "point_cloud_processing_results",
    );
  });

  it("persists BCF topics, comments, and durable IFC component links", () => {
    expect(getTableName(bcfTopics)).toBe("bcf_topics");
    expect(getTableName(bcfComments)).toBe("bcf_comments");
    expect(getTableName(bcfTopicComponents)).toBe("bcf_topic_components");
    expect(getTableName(bcfViewpoints)).toBe("bcf_viewpoints");
    expect(bcfTopics.bcfGuid.notNull).toBe(true);
    expect(bcfComments.bcfGuid.notNull).toBe(true);
    expect(bcfViewpoints.bcfGuid.notNull).toBe(true);
    expect(bcfTopicStatusEnum.enumValues).toEqual([
      "open",
      "in_progress",
      "resolved",
      "closed",
    ]);
    expect(bcfPriorityEnum.enumValues).toEqual([
      "low",
      "normal",
      "high",
      "critical",
    ]);
  });

  it("persists assistant threads and their ordered messages", () => {
    expect(getTableName(assistantThreads)).toBe("assistant_threads");
    expect(getTableName(assistantMessages)).toBe("assistant_messages");
  });

  it("keeps cleanup jobs independent from resources being deleted", () => {
    expect(getTableName(deletionJobs)).toBe("deletion_jobs");
    expect(deletionJobTypeEnum.enumValues).toEqual([
      "delete_asset",
      "delete_project",
    ]);
  });
});
