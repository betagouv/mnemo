import { openAssetResultSchema } from "@mnemo/contracts/assets";
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

test("rejects invalid asset access on its explicit route", async ({
  request,
}) => {
  const response = await request.get(
    "/api/projects/invalid/assets/invalid/access",
  );
  expect(response.status()).toBe(404);
});

test("creates, reloads, opens and deletes a project asset", async ({
  page,
  request,
}) => {
  const projectName = `Projet Playwright ${Date.now()}`;

  await page.goto("/projets");
  await page.getByLabel("Nom du projet").fill(projectName);
  await page
    .getByLabel("Description")
    .fill("Projet créé par le parcours navigateur automatisé.");
  await page.getByRole("button", { name: "Créer le projet" }).click();

  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  const projectHref = await page
    .getByRole("link", { name: new RegExp(projectName) })
    .getAttribute("href");
  expect(projectHref).toMatch(/^\/projets\/[0-9a-f-]{36}$/);
  if (!projectHref) throw new Error("The created project has no URL");

  try {
    await page.reload();
    await expect(
      page.getByRole("heading", { name: projectName }),
    ).toBeVisible();

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
    await page.reload();
    await expect(page.getByRole("heading", { name: fileName })).toBeVisible();

    const viewerHref = await page
      .getByRole("link", { name: "Ouvrir" })
      .getAttribute("href");
    const projectId = projectHref.split("/").at(-1);
    const assetId = viewerHref?.split("/").at(-1);
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
    expect(assetId).toMatch(/^[0-9a-f-]{36}$/);
    const response = await request.get(
      `/api/projects/${projectId}/assets/${assetId}/access`,
    );
    expect(response.ok()).toBe(true);
    expect(openAssetResultSchema.parse(await response.json()).asset.id).toBe(
      assetId,
    );
  } finally {
    await page.goto(projectHref);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Supprimer le projet" }).click();
    await expect(page).toHaveURL(/\/projets$/);
  }
});
