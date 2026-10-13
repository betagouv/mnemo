import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const port = process.env.MNEMO_WEB_PORT ?? "3200";
const modelDirectory =
  process.env.MNEMO_DEV_MODEL_DIR ?? resolve(".data/ifc-mcp-models");

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is required in the selected env profile`);
  return value;
}

const environment = {
  ...process.env,
  MNEMO_AUTH_MODE: process.env.MNEMO_AUTH_MODE ?? "development",
  MNEMO_DEPLOYMENT_ENV: process.env.MNEMO_DEPLOYMENT_ENV ?? "local",
  MNEMO_BACKGROUND_JOBS: "1",
  MNEMO_REPO_ROOT: process.cwd(),
  MNEMO_ENV_FILE: process.env.MNEMO_ENV_FILE ?? ".env.local",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    `postgresql://mnemo:mnemo@localhost:${process.env.MNEMO_POSTGRES_PORT ?? "5436"}/mnemo`,
  S3_ENDPOINT: requireEnvironment("S3_ENDPOINT"),
  S3_PUBLIC_ENDPOINT: requireEnvironment("S3_PUBLIC_ENDPOINT"),
  S3_REGION: requireEnvironment("S3_REGION"),
  S3_BUCKET: requireEnvironment("S3_BUCKET"),
  S3_ACCESS_KEY: requireEnvironment("S3_ACCESS_KEY"),
  S3_SECRET_KEY: requireEnvironment("S3_SECRET_KEY"),
  S3_PROCESSING_ENDPOINT:
    process.env.S3_DOCKER_ENDPOINT ?? process.env.S3_ENDPOINT,
  IFC_SERVER_URL:
    process.env.IFC_SERVER_URL ??
    `http://localhost:${process.env.MNEMO_IFC_SERVER_PORT ?? "3301"}`,
  IFC_SERVER_API_TOKEN:
    process.env.IFC_SERVER_API_TOKEN ?? "mnemo-local-ifc-token",
  IFC_BROWSER_PROCESSING_MAX_BYTES:
    process.env.IFC_BROWSER_PROCESSING_MAX_BYTES ?? "0",
  IFC_MCP_URL:
    process.env.IFC_MCP_URL ??
    `http://localhost:${process.env.MNEMO_IFC_MCP_PORT ?? "8765"}`,
  IFC_MCP_TOKEN: process.env.IFC_MCP_TOKEN ?? "mnemo-local-ifc-mcp-token",
  IFC_MCP_CACHE_DIR: modelDirectory,
  IFC_MCP_MODEL_DIR: "/app/models",
  OPENROUTER_APP_URL:
    process.env.OPENROUTER_APP_URL ?? `http://localhost:${port}`,
};

function run(args) {
  const result = spawnSync("pnpm", args, {
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) process.exit(130);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["db:generate"]);
run(["db:seed"]);
console.info(`Next.js development server: http://localhost:${port}`);
run(["--filter", "@mnemo/web", "dev", "--hostname", "0.0.0.0", "--port", port]);
