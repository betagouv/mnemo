import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { request, type FullConfig } from "@playwright/test";

export default async function authSetup(config: FullConfig) {
  const baseURL = String(config.projects[0]?.use.baseURL);
  const email = `mnemo-e2e-${randomUUID()}@example.invalid`;
  const api = await request.newContext({ baseURL });
  const password = `Local-test-password-${randomUUID()}`;
  const response = await api.post("/api/auth/sign-up/email", {
    data: {
      name: "Test navigateur Mnemo",
      email,
      password,
    },
  });
  if (!response.ok()) {
    throw new Error(`E2E account creation failed: HTTP ${response.status()}`);
  }
  await api.dispose();
  await writeFile(
    ".e2e-auth-account.json",
    JSON.stringify({ email, password }),
  );
}
