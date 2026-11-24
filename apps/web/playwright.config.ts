import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
if (
  externalBaseUrl &&
  !["localhost", "127.0.0.1"].includes(new URL(externalBaseUrl).hostname)
) {
  throw new Error("Browser tests may only target a local development server");
}

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/auth-setup.ts",
  globalTeardown: "./tests/e2e/auth-teardown.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  // Hosted runners render WebGPU in software: one pick takes several seconds.
  expect: { timeout: process.env.CI ? 30_000 : 5_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: process.env.CI ? "pnpm start:e2e" : "pnpm dev:e2e",
        env: {
          DATABASE_URL:
            process.env.DATABASE_URL ??
            "postgresql://mnemo:mnemo@localhost:5436/mnemo",
          IFC_BROWSER_PROCESSING_MAX_BYTES:
            process.env.IFC_BROWSER_PROCESSING_MAX_BYTES ?? "26214400",
          IFC_SERVER_URL: process.env.IFC_SERVER_URL ?? "http://localhost:3301",
          IFC_SERVER_API_TOKEN:
            process.env.IFC_SERVER_API_TOKEN ?? "mnemo-local-ifc-token",
          IFC_LITE_SERVER_URL:
            process.env.IFC_LITE_SERVER_URL ?? "http://localhost:3301",
          BETTER_AUTH_URL:
            process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3100",
          BETTER_AUTH_SECRET:
            process.env.BETTER_AUTH_SECRET ??
            "local-e2e-only-secret-at-least-32-characters",
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
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.CI ? "chromium" : "chrome",
        launchOptions: {
          args: process.env.CI
            ? [
                "--enable-unsafe-webgpu",
                "--enable-features=Vulkan",
                "--use-vulkan=swiftshader",
                "--disable-vulkan-surface",
                "--ignore-gpu-blocklist",
                "--enable-gpu",
              ]
            : [
                "--enable-gpu",
                "--enable-webgpu",
                "--enable-unsafe-webgpu",
                "--use-angle=default",
                "--ignore-gpu-blocklist",
              ],
        },
      },
    },
  ],
});
