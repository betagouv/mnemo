import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { proxy } from "./proxy";

const originalEnvironment = {
  APP: process.env.APP,
  SCALINGO_APPLICATION_ID: process.env.SCALINGO_APPLICATION_ID,
  MNEMO_DEPLOYMENT_ENV: process.env.MNEMO_DEPLOYMENT_ENV,
  MNEMO_STAGING_USER: process.env.MNEMO_STAGING_USER,
  MNEMO_STAGING_PASSWORD: process.env.MNEMO_STAGING_PASSWORD,
};

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

function request(path: string, authorization?: string) {
  return new NextRequest(`https://mnemo.example${path}`, {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("staging access gate", () => {
  it("leaves local development available", () => {
    delete process.env.APP;
    delete process.env.SCALINGO_APPLICATION_ID;
    delete process.env.MNEMO_DEPLOYMENT_ENV;

    expect(proxy(request("/")).status).toBe(200);
  });

  it("fails closed on Scalingo when the deployment mode is absent", () => {
    process.env.APP = "mnemo-web";
    delete process.env.MNEMO_DEPLOYMENT_ENV;

    expect(proxy(request("/")).status).toBe(503);
  });

  it("fails closed when staging credentials are absent", () => {
    process.env.MNEMO_DEPLOYMENT_ENV = "staging";
    delete process.env.MNEMO_STAGING_USER;
    delete process.env.MNEMO_STAGING_PASSWORD;

    expect(proxy(request("/api/projects")).status).toBe(503);
  });

  it("challenges pages and API routes before serving them", () => {
    process.env.MNEMO_DEPLOYMENT_ENV = "staging";
    process.env.MNEMO_STAGING_USER = "testeur";
    process.env.MNEMO_STAGING_PASSWORD = "un-secret";

    for (const path of ["/", "/projets/demo/viewer", "/api/projects"]) {
      const response = proxy(request(path));
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
    }
  });

  it("accepts only the configured credentials", () => {
    process.env.MNEMO_DEPLOYMENT_ENV = "staging";
    process.env.MNEMO_STAGING_USER = "testeur";
    process.env.MNEMO_STAGING_PASSWORD = "un-secret";

    expect(
      proxy(
        request("/", `Basic ${Buffer.from("testeur:non").toString("base64")}`),
      ).status,
    ).toBe(401);
    expect(
      proxy(
        request(
          "/",
          `Basic ${Buffer.from("testeur:un-secret").toString("base64")}`,
        ),
      ).status,
    ).toBe(200);
  });

  it("never enables development authentication in production", () => {
    process.env.MNEMO_DEPLOYMENT_ENV = "production";
    process.env.MNEMO_STAGING_USER = "testeur";
    process.env.MNEMO_STAGING_PASSWORD = "un-secret";

    expect(
      proxy(
        request(
          "/",
          `Basic ${Buffer.from("testeur:un-secret").toString("base64")}`,
        ),
      ).status,
    ).toBe(503);
  });
});
