import { afterEach, describe, expect, it } from "vitest";

import { resolveActor } from "./resolve-actor";

const originalDeploymentEnvironment = process.env.MNEMO_DEPLOYMENT_ENV;
const originalAuthenticationMode = process.env.MNEMO_AUTH_MODE;
const originalScalingoApplication = process.env.APP;
const originalScalingoApplicationId = process.env.SCALINGO_APPLICATION_ID;

afterEach(() => {
  if (originalDeploymentEnvironment === undefined) {
    delete process.env.MNEMO_DEPLOYMENT_ENV;
  } else {
    process.env.MNEMO_DEPLOYMENT_ENV = originalDeploymentEnvironment;
  }

  if (originalAuthenticationMode === undefined) {
    delete process.env.MNEMO_AUTH_MODE;
  } else {
    process.env.MNEMO_AUTH_MODE = originalAuthenticationMode;
  }

  if (originalScalingoApplication === undefined) {
    delete process.env.APP;
  } else {
    process.env.APP = originalScalingoApplication;
  }

  if (originalScalingoApplicationId === undefined) {
    delete process.env.SCALINGO_APPLICATION_ID;
  } else {
    process.env.SCALINGO_APPLICATION_ID = originalScalingoApplicationId;
  }
});

describe("resolveActor", () => {
  it("resolves the local development actor by default", () => {
    delete process.env.APP;
    delete process.env.SCALINGO_APPLICATION_ID;
    expect(resolveActor()).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      authenticationMode: "development",
    });
  });

  it("rejects development authentication in production", () => {
    process.env.MNEMO_DEPLOYMENT_ENV = "production";

    expect(() => resolveActor()).toThrow(
      "Development authentication cannot be used",
    );
  });

  it("rejects an accidentally local configuration on Scalingo", () => {
    process.env.APP = "mnemo-web";
    delete process.env.MNEMO_DEPLOYMENT_ENV;

    expect(() => resolveActor()).toThrow(
      "Development authentication cannot be used",
    );
  });
});
