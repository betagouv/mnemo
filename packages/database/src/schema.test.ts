import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  assetKindEnum,
  assets,
  assetStatusEnum,
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
});
