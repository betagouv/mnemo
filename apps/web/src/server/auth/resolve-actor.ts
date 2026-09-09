import { developmentActorId } from "@mnemo/database";

export type Actor = {
  id: string;
  authenticationMode: "development";
};

export function resolveActor(): Actor {
  const authenticationMode = process.env.MNEMO_AUTH_MODE ?? "development";
  const deploymentEnvironment = process.env.MNEMO_DEPLOYMENT_ENV ?? "local";

  if (authenticationMode !== "development") {
    throw new Error(`Unsupported authentication mode: ${authenticationMode}`);
  }

  if (deploymentEnvironment === "production") {
    throw new Error(
      "Development authentication cannot be used in a production deployment",
    );
  }

  return {
    id: developmentActorId,
    authenticationMode,
  };
}
