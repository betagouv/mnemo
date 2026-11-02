import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";

const email = `mnemo-auth-test-${randomUUID()}@example.invalid`;
const password = `Local-test-password-${randomUUID()}`;
const testIp = `2001:db8:${randomUUID().replaceAll("-", "").slice(0, 4)}::1`;

async function configuredAuth() {
  process.env.BETTER_AUTH_URL = "http://localhost:3200";
  process.env.BETTER_AUTH_SECRET =
    "integration-test-secret-with-at-least-32-characters";
  const { auth } = await import("./better-auth");
  return auth;
}

afterAll(async () => {
  await getRuntimePrismaDatabase().users.deleteMany({ where: { email } });
});

describe("Better Auth with Mnemo users", () => {
  it("registers and authenticates an isolated real account", async () => {
    const auth = await configuredAuth();
    const response = await auth.handler(
      new Request("http://localhost:3200/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3200",
          "x-forwarded-for": testIp,
        },
        body: JSON.stringify({ name: "Test Mnemo", email, password }),
      }),
    );

    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("better-auth.session_token");

    const account = await getRuntimePrismaDatabase().users.findUnique({
      where: { email },
      include: { auth_accounts: true },
    });
    expect(account).toMatchObject({
      display_name: "Test Mnemo",
      email_verified: false,
    });
    expect(account?.auth_accounts).toHaveLength(1);
    expect(account?.auth_accounts[0]?.password).not.toBe(password);

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookie?.split(";")[0] ?? "" }),
    });
    expect(session?.user.id).toBe(account?.id);

    const login = await auth.handler(
      new Request("http://localhost:3200/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3200",
          "x-forwarded-for": testIp,
        },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain(
      "better-auth.session_token",
    );

    const loginCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    const logout = await auth.handler(
      new Request("http://localhost:3200/api/auth/sign-out", {
        method: "POST",
        headers: {
          cookie: loginCookie,
          origin: "http://localhost:3200",
          "x-forwarded-for": testIp,
        },
      }),
    );
    expect(logout.status).toBe(200);
    expect(
      await auth.api.getSession({
        headers: new Headers({ cookie: loginCookie }),
      }),
    ).toBeNull();
  });
});
