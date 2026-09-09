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

test("creates a persistent project from the workspace", async ({ page }) => {
  const projectName = `Projet Playwright ${Date.now()}`;

  await page.goto("/projets");
  await page.getByLabel("Nom du projet").fill(projectName);
  await page
    .getByLabel("Description")
    .fill("Projet créé par le parcours navigateur automatisé.");
  await page.getByRole("button", { name: "Créer le projet" }).click();

  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await page.getByRole("link", { name: new RegExp(projectName) }).click();
  await expect(page).toHaveURL(/\/projets\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: projectName, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fichiers du projet" }),
  ).toBeVisible();

  const fileName = `maquette-${Date.now()}.ifc`;
  await page.locator('input[type="file"][accept*=".ifc"]').setInputFiles({
    name: fileName,
    mimeType: "application/x-step",
    buffer: Buffer.from("ISO-10303-21;\nEND-ISO-10303-21;\n"),
  });

  await expect(page.getByRole("heading", { name: fileName })).toBeVisible();
  await expect(page.getByText("Reçu", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: fileName })).toBeVisible();
});
