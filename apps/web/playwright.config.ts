import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev:e2e",
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://mnemo:mnemo@localhost:5436/mnemo",
      IFC_BROWSER_PROCESSING_MAX_BYTES:
        process.env.IFC_BROWSER_PROCESSING_MAX_BYTES ?? "26214400",
      IFC_LITE_PUBLIC_URL:
        process.env.IFC_LITE_PUBLIC_URL ?? "http://localhost:3301",
      IFC_LITE_SERVER_URL:
        process.env.IFC_LITE_SERVER_URL ?? "http://localhost:3301",
      MNEMO_AUTH_MODE: process.env.MNEMO_AUTH_MODE ?? "development",
      MNEMO_DEPLOYMENT_ENV: process.env.MNEMO_DEPLOYMENT_ENV ?? "local",
      S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? "mnemo",
      S3_BUCKET: process.env.S3_BUCKET ?? "mnemo-files",
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9200",
      S3_PUBLIC_ENDPOINT:
        process.env.S3_PUBLIC_ENDPOINT ?? "http://localhost:9200",
      S3_REGION: process.env.S3_REGION ?? "us-east-1",
      S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? "mnemo-local-password",
    },
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
