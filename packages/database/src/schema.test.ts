import { describe, expect, it } from "vitest";

import {
  deletion_job_type,
  processing_job_status,
  project_role,
} from "./generated/prisma/client";
import { createPrismaDatabase } from "./prisma-client";

describe("Prisma database contract", () => {
  it("retains the tables required by the workspace", async () => {
    const { db, close } = createPrismaDatabase({
      connectionString: "postgresql://unused:unused@localhost:1/unused",
    });
    for (const delegate of [
      db.users,
      db.projects,
      db.project_members,
      db.assets,
      db.project_bim_filters,
      db.processing_jobs,
      db.deletion_jobs,
      db.asset_processing_results,
      db.point_cloud_settings,
      db.point_cloud_processing_results,
      db.bcf_topics,
      db.bcf_comments,
      db.bcf_topic_components,
      db.bcf_viewpoints,
      db.assistant_threads,
      db.assistant_messages,
    ]) {
      expect(typeof delegate.findMany).toBe("function");
    }
    await close();
  });

  it("retains the roles and processing lifecycle enums", () => {
    expect(Object.values(project_role)).toEqual(["owner", "editor", "viewer"]);
    expect(Object.values(processing_job_status)).toEqual([
      "queued",
      "running",
      "succeeded",
      "failed",
    ]);
    expect(Object.values(deletion_job_type)).toEqual([
      "delete_bcf_upload",
      "delete_asset",
      "delete_project",
    ]);
  });
});
