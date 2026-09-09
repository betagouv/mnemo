import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { projectMembers, projectRoleEnum, projects, users } from "./schema";

describe("database schema", () => {
  it("keeps project access in an explicit membership table", () => {
    expect(getTableName(users)).toBe("users");
    expect(getTableName(projects)).toBe("projects");
    expect(getTableName(projectMembers)).toBe("project_members");
  });

  it("persists only supported project roles", () => {
    expect(projectRoleEnum.enumValues).toEqual(["owner", "editor", "viewer"]);
  });
});
