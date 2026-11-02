import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";

const deliveries = vi.hoisted(
  () => [] as { to: string; subject: string; text: string }[],
);
vi.mock("./brevo-email", () => ({
  sendAuthEmail: vi.fn(async (message: (typeof deliveries)[number]) => {
    deliveries.push(message);
  }),
}));

const email = `mnemo-auth-test-${randomUUID()}@example.invalid`;
const password = `Local-test-password-${randomUUID()}`;
const newPassword = `New-local-test-password-${randomUUID()}`;
const testIp = `2001:db8:${randomUUID().replaceAll("-", "").slice(0, 4)}::1`;
const base = "http://localhost:3200";

async function configuredAuth() {
  process.env.BETTER_AUTH_URL = base;
  process.env.BETTER_AUTH_SECRET =
    "integration-test-secret-with-at-least-32-characters";
  const { auth } = await import("./better-auth");
  return auth;
}

function post(path: string, body: unknown, cookie?: string) {
  return new Request(`${base}/api/auth/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: base,
      "x-forwarded-for": testIp,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function lastLink() {
  const link = deliveries.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error("Expected an email containing a link");
  return link;
}

afterAll(async () => {
  await getRuntimePrismaDatabase().users.deleteMany({ where: { email } });
});

describe("Better Auth email verification and password recovery", () => {
  it("requires confirmation, then allows login and one-use password recovery", async () => {
    const auth = await configuredAuth();
    const signup = await auth.handler(
      post("sign-up/email", {
        name: "Test Mnemo",
        email,
        password,
        callbackURL: "/connexion?verification=ok",
      }),
    );
    expect(signup.status).toBe(200);
    expect(signup.headers.get("set-cookie") ?? "").not.toContain(
      "better-auth.session_token",
    );
    expect(deliveries.at(-1)).toMatchObject({
      to: email,
      subject: "Confirmer votre adresse e-mail Mnemo",
    });
    const { sendAuthEmail } = await import("./brevo-email");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendAuthEmail).mockRejectedValueOnce(
      new Error("provider failure"),
    );
    const failedResend = await auth.handler(
      post("send-verification-email", {
        email,
        callbackURL: "/connexion?verification=ok",
      }),
    );
    expect(failedResend.status).toBe(200);
    errorLog.mockRestore();
    const resend = await auth.handler(
      post("send-verification-email", {
        email,
        callbackURL: "/connexion?verification=ok",
      }),
    );
    expect(resend.status).toBe(200);
    expect(deliveries).toHaveLength(2);
    const unknownResend = await auth.handler(
      post("send-verification-email", {
        email: `unknown-${randomUUID()}@example.invalid`,
        callbackURL: "/connexion?verification=ok",
      }),
    );
    expect(unknownResend.status).toBe(resend.status);
    const verificationLink = lastLink();

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

    const beforeConfirmation = await auth.handler(
      post("sign-in/email", { email, password }),
    );
    expect(beforeConfirmation.status).toBe(403);

    const verification = await auth.handler(new Request(verificationLink));
    expect(verification.status).toBe(302);
    expect(
      await getRuntimePrismaDatabase().users.findUnique({ where: { email } }),
    ).toMatchObject({ email_verified: true });

    const login = await auth.handler(
      post("sign-in/email", { email, password }),
    );
    expect(login.status).toBe(200);
    const loginCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(loginCookie).toContain("better-auth.session_token");
    expect(
      await auth.api.getSession({
        headers: new Headers({ cookie: loginCookie }),
      }),
    ).toMatchObject({ user: { id: account?.id, emailVerified: true } });

    const recovery = await auth.handler(
      post("request-password-reset", {
        email,
        redirectTo: "/reinitialiser-mot-de-passe",
      }),
    );
    expect(recovery.status).toBe(200);
    expect(deliveries.at(-1)).toMatchObject({
      to: email,
      subject: "Réinitialiser votre mot de passe Mnemo",
    });
    const deliveriesBeforeUnknown = deliveries.length;
    const unknownRecovery = await auth.handler(
      post("request-password-reset", {
        email: `unknown-${randomUUID()}@example.invalid`,
        redirectTo: "/reinitialiser-mot-de-passe",
      }),
    );
    expect(unknownRecovery.status).toBe(recovery.status);
    expect(deliveries).toHaveLength(deliveriesBeforeUnknown);
    const recoveryLink = lastLink();
    const callback = await auth.handler(new Request(recoveryLink));
    expect(callback.status).toBe(302);
    const token = new URL(
      callback.headers.get("location") ?? base,
    ).searchParams.get("token");
    expect(token).toBeTruthy();

    expect(
      (await auth.handler(post("reset-password", { token, newPassword })))
        .status,
    ).toBe(200);
    expect(
      (await auth.handler(post("reset-password", { token, newPassword })))
        .status,
    ).not.toBe(200);
    expect(
      (await auth.handler(post("sign-in/email", { email, password }))).status,
    ).not.toBe(200);
    expect(
      (
        await auth.handler(
          post("sign-in/email", { email, password: newPassword }),
        )
      ).status,
    ).toBe(200);
    expect(
      await auth.api.getSession({
        headers: new Headers({ cookie: loginCookie }),
      }),
    ).toBeNull();
  });
});
