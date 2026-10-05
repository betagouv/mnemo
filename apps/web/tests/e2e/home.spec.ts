import { openAssetResultSchema } from "@mnemo/contracts/assets";
import { expect, test } from "@playwright/test";

test("renders the application foundation", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Piloter vos décisions numériques pour le bâtiment patrimonial",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Explorer mes dossiers" }),
  ).toHaveAttribute("href", "/projets");
  await expect(page.getByRole("banner")).toContainText("Mnemo");
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("keeps the landing page usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Accéder à vos fichiers et à vos données",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Explorer mes dossiers" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("keeps the dossier dashboard usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projets");

  await expect(
    page.getByRole("heading", { name: "Mes dossiers" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nouveau dossier" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await expect(page.getByLabel("Titre du dossier")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
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
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await page.getByLabel("Titre du dossier").fill(projectName);
  await page.getByLabel("Adresse").fill("2 place de la Concorde, Paris");
  await page
    .getByLabel("Description")
    .fill("Projet créé par le parcours navigateur automatisé.");
  await page.getByRole("button", { name: "Créer le dossier" }).click();

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

    await page
      .getByRole("searchbox", { name: "Rechercher un dossier" })
      .fill("aucun dossier avec ce texte 123456789");
    await expect(page.getByRole("status")).toContainText(
      "Aucun dossier ne correspond",
    );
    await page
      .getByRole("searchbox", { name: "Rechercher un dossier" })
      .fill(projectName);
    await expect(page.getByRole("article")).toHaveCount(1);
    await page
      .getByRole("combobox", { name: "Trier par" })
      .selectOption("title");

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
