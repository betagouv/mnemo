import type { Page } from "@playwright/test";

export async function waitForHydration(page: Page) {
  await page.waitForFunction(
    () => typeof (window as Window & { dsfr?: unknown }).dsfr === "function",
  );
}

export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url);
  await waitForHydration(page);
}
