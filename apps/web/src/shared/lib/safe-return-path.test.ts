import { describe, expect, it } from "vitest";

import { safeReturnPath } from "./safe-return-path";

describe("safeReturnPath", () => {
  it("keeps an internal invitation route", () => {
    expect(safeReturnPath("/invitations/abc")).toBe("/invitations/abc");
  });

  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/\nother"])(
    "rejects an unsafe return target: %s",
    (path) => expect(safeReturnPath(path)).toBe("/projets"),
  );
});
