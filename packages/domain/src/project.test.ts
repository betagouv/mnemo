import { describe, expect, it } from "vitest";

import { hasProjectPermission } from "./project";

describe("project permissions", () => {
  it("lets an owner manage members and delete a project", () => {
    expect(hasProjectPermission("owner", "member:manage")).toBe(true);
    expect(hasProjectPermission("owner", "project:delete")).toBe(true);
  });

  it("lets an editor contribute without managing membership", () => {
    expect(hasProjectPermission("editor", "asset:create")).toBe(true);
    expect(hasProjectPermission("editor", "bcf:write")).toBe(true);
    expect(hasProjectPermission("editor", "member:manage")).toBe(false);
  });

  it("keeps a viewer read-only", () => {
    expect(hasProjectPermission("viewer", "project:read")).toBe(true);
    expect(hasProjectPermission("viewer", "project:update")).toBe(false);
  });
});
