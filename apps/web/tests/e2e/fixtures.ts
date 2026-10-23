import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { test as base, expect } from "@playwright/test";

export { expect };

export const test = base.extend<{ authenticated: void }>({
  authenticated: [
    async ({ page }, provide) => {
      const { email, password } = JSON.parse(
        await readFile(".e2e-auth-account.json", "utf8"),
      ) as { email: string; password: string };
      const ip = `2001:db8:${randomUUID().replaceAll("-", "").slice(0, 4)}::1`;
      const response = await page
        .context()
        .request.post("/api/auth/sign-in/email", {
          data: { email, password },
          headers: { "x-forwarded-for": ip },
        });
      expect(response.ok()).toBe(true);
      await provide();
    },
    { auto: true },
  ],
  request: async ({ authenticated, page }, provide) => {
    void authenticated;
    await provide(page.context().request);
  },
});
