import { expect, test } from "@playwright/test";

test("renders the application foundation", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Comprendre une maquette, ensemble." }),
  ).toBeVisible();
  await expect(page.getByRole("banner")).toContainText("Mnemo");
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("exposes a healthy application endpoint", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({
    service: "mnemo-web",
    status: "ok",
  });
});

test("exposes the type-safe API over HTTP", async ({ request }) => {
  const response = await request.get("/api/trpc/system.info");

  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.result.data).toMatchObject({
    service: "mnemo-web",
    apiVersion: "v1",
    status: "ok",
  });
});
