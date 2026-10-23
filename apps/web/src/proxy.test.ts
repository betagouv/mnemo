import { afterEach, describe, expect, it } from "vitest";

import { proxy } from "./proxy";

const originalUrl = process.env.BETTER_AUTH_URL;
const originalSecret = process.env.BETTER_AUTH_SECRET;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = originalUrl;
  if (originalSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = originalSecret;
});

describe("authentication configuration", () => {
  it("fails closed when Better Auth is not configured", () => {
    delete process.env.BETTER_AUTH_URL;
    delete process.env.BETTER_AUTH_SECRET;
    expect(proxy().status).toBe(503);
  });

  it("allows requests when Better Auth is configured", () => {
    process.env.BETTER_AUTH_URL = "https://mnemo.example";
    process.env.BETTER_AUTH_SECRET = "a-secret-at-least-thirty-two-bytes-long";
    expect(proxy().status).toBe(200);
  });
});
