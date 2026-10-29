import { describe, expect, it } from "vitest";

import {
  addMemberInputSchema,
  createProjectRoleInputSchema,
  setMemberAccessInputSchema,
} from "./project-access";

const projectId = "d14ccec4-b8c9-437e-89af-0690c9c9682b";
const userId = "a805b627-40b3-45c1-9d13-91042c67f025";

describe("project access inputs", () => {
  it("accepts a narrow BCF comment role", () => {
    expect(
      createProjectRoleInputSchema.parse({
        projectId,
        name: "Commentateur",
        permissions: ["bcf:comment:create"],
      }).permissions,
    ).toEqual(["bcf:comment:create"]);
  });

  it("rejects owner-level grants and owner membership", () => {
    expect(
      createProjectRoleInputSchema.safeParse({
        projectId,
        name: "Admin",
        permissions: ["member:manage"],
      }).success,
    ).toBe(false);
    expect(
      createProjectRoleInputSchema.safeParse({
        projectId,
        name: "Vide",
        permissions: [],
      }).success,
    ).toBe(false);
    expect(
      setMemberAccessInputSchema.safeParse({
        projectId,
        userId,
        baseRole: "owner",
        roleIds: [],
        permissions: [],
      }).success,
    ).toBe(false);
    expect(
      addMemberInputSchema.safeParse({
        projectId,
        email: "guest@example.invalid",
        baseRole: "owner",
        roleIds: [],
        permissions: [],
      }).success,
    ).toBe(false);
  });
});
