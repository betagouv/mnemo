import { fileURLToPath } from "node:url";

import { openAssetResultSchema } from "@mnemo/contracts/assets";
import { expect, test } from "./fixtures";

import { gotoHydrated, waitForHydration } from "./hydration";

const sampleIfcPath = fileURLToPath(
  new URL("../fixtures/Ifc4_SampleHouse.ifc", import.meta.url),
);

test("renders the application foundation", async ({ page }) => {
  await gotoHydrated(page, "/");

  await expect(
    page.getByRole("heading", {
      name: "Piloter vos décisions numériques pour le bâtiment patrimonial",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Explorer mes dossiers" }),
  ).toHaveAttribute("href", "/projets");
  await expect(
    page.getByRole("banner").getByRole("img", { name: /^Mnemo/ }),
  ).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("keeps the landing page usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHydrated(page, "/");

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
  await gotoHydrated(page, "/projets");

  await expect(
    page.getByRole("banner").getByRole("img", { name: /^Mnemo/ }),
  ).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mes dossiers" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nouveau dossier" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await expect(
    page.getByRole("dialog", { name: "Créer un dossier" }),
  ).toBeVisible();
  await expect(page.getByLabel("Titre du dossier")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("fits the project modal in a desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoHydrated(page, "/projets");
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await expect(
    page.getByRole("dialog", { name: "Créer un dossier" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const modalBody = page
    .getByRole("dialog", { name: "Créer un dossier" })
    .locator(".fr-modal__body");
  expect(
    await modalBody.evaluate(
      (element) => element.scrollHeight <= element.clientHeight,
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

test("creates and edits dossier metadata in DSFR modals", async ({ page }) => {
  const originalTitle = `Dossier initial ${Date.now()}`;
  const updatedTitle = `Dossier modifié ${Date.now()}`;

  await gotoHydrated(page, "/projets");
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  const createDialog = page.getByRole("dialog", { name: "Créer un dossier" });
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel("Titre du dossier").fill(originalTitle);
  await createDialog.getByLabel("Adresse").fill("Adresse initiale");
  await createDialog.getByRole("button", { name: "Créer le dossier" }).click();
  await expect(createDialog).not.toBeVisible();

  const projectHref = await page
    .getByRole("link", { name: originalTitle })
    .getAttribute("href");
  if (!projectHref) throw new Error("The created project has no URL");

  try {
    await gotoHydrated(page, projectHref);
    await page.getByRole("button", { name: "Modifier le dossier" }).click();
    const editDialog = page.getByRole("dialog", {
      name: "Modifier le dossier",
    });
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByLabel("Adresse")).toHaveValue(
      "Adresse initiale",
    );
    await editDialog.getByLabel("Titre du dossier").fill(updatedTitle);
    await editDialog
      .getByLabel("Adresse")
      .fill("2 place de la Concorde, Paris");
    await editDialog.getByLabel("Description").fill("Description enregistrée");
    await editDialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(editDialog).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: updatedTitle, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("2 place de la Concorde, Paris")).toBeVisible();
    await expect(
      page.locator("p").filter({ hasText: "Description enregistrée" }),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("heading", { name: "Fichiers", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.reload();
    await waitForHydration(page);
    await expect(
      page.getByRole("heading", { name: updatedTitle, level: 1 }),
    ).toBeVisible();
    await gotoHydrated(page, "/projets");
    await page
      .getByRole("searchbox", { name: "Rechercher un dossier" })
      .fill(updatedTitle);
    await expect(page.getByRole("link", { name: updatedTitle })).toBeVisible();
  } finally {
    await gotoHydrated(page, projectHref);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Supprimer le projet" }).click();
    await expect(page).toHaveURL(/\/projets$/);
  }
});

test("creates, reloads, opens and deletes a project asset", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const projectName = `Projet Playwright ${Date.now()}`;

  await gotoHydrated(page, "/projets");
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
    await waitForHydration(page);
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
      page.getByRole("heading", { name: "Fichiers", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sélectionner un fichier" }),
    ).toBeVisible();

    await page
      .getByRole("group", { name: "Ajouter un fichier au projet" })
      .evaluate((dropzone) => {
        dropzone.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: new DataTransfer(),
          }),
        );
      });
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Le navigateur n’a transmis aucun fichier" }),
    ).toBeVisible();

    await page
      .getByRole("group", { name: "Ajouter un fichier au projet" })
      .evaluate((dropzone) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(["incorrect"], "plan.pdf"));
        Object.defineProperty(transfer, "files", { value: { length: 0 } });
        dropzone.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }),
        );
      });
    await expect(
      page.getByRole("alert").filter({ hasText: "Format non pris en charge" }),
    ).toBeVisible();

    await page
      .getByRole("group", { name: "Ajouter un fichier au projet" })
      .evaluate((dropzone) => {
        dropzone.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: new DataTransfer(),
          }),
        );
      });
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Le navigateur n’a transmis aucun fichier" }),
    ).toBeVisible();

    await page
      .getByRole("group", { name: "Ajouter un fichier au projet" })
      .evaluate((dropzone) => {
        const transfer = new DataTransfer();
        const file = new File(["incorrect"], "plan.pdf");
        transfer.items.add(file);
        Object.defineProperty(transfer, "files", { value: { length: 0 } });
        Object.defineProperty(transfer.items[0], "getAsFile", {
          value: () => null,
        });
        Object.defineProperty(transfer.items[0], "getAsFileSystemHandle", {
          value: async () => ({ kind: "file", getFile: async () => file }),
        });
        dropzone.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }),
        );
      });
    await expect(
      page.getByRole("alert").filter({ hasText: "Format non pris en charge" }),
    ).toBeVisible();

    await page
      .getByRole("group", { name: "Ajouter un fichier au projet" })
      .evaluate((dropzone) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(["first"], "first.ifc"));
        transfer.items.add(new File(["second"], "second.ifc"));
        dropzone.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }),
        );
      });
    await expect(
      page.getByRole("alert").filter({ hasText: "2 fichiers détectés" }),
    ).toBeVisible();

    const fileName = "Ifc4_SampleHouse.ifc";
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Sélectionner un fichier" }).click(),
    ]);
    await fileChooser.setFiles(sampleIfcPath);

    await expect(page.getByRole("heading", { name: fileName })).toBeVisible();
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: fileName })).toBeVisible();

    const projectId = projectHref.split("/").at(-1);
    const assetId = await page
      .getByRole("article")
      .filter({ hasText: fileName })
      .getAttribute("data-asset-id");
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
    expect(assetId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("link", { name: "Ouvrir", exact: true }),
    ).toHaveCount(0);
    const response = await request.get(
      `/api/projects/${projectId}/assets/${assetId}/access`,
    );
    expect(response.ok()).toBe(true);
    expect(openAssetResultSchema.parse(await response.json()).asset.id).toBe(
      assetId,
    );

    await page.getByRole("link", { name: "Ouvrir la vue 3D" }).click();
    await expect(page).toHaveURL(/\/projets\/[0-9a-f-]+\/viewer$/);
    await expect(
      page.locator('[aria-label="Visionneuse 3D du projet"]'),
    ).toBeVisible();

    // Hosted CI has no reliable WebGPU device. The same versioned fixture is
    // parsed and counted without GPU in sample-house-fixture.test.ts; the
    // headed local E2E additionally checks the rendered viewer counters.
    if (process.env.CI) return;

    const stats = page
      .locator('[aria-label="Visionneuse 3D du projet"] [role="status"]')
      .filter({ hasText: "entités IFC" });
    const viewerError = page.locator(
      '[aria-label="Visionneuse 3D du projet"] [role="alert"]',
    );
    try {
      await expect(stats.or(viewerError)).toBeVisible({ timeout: 120_000 });
    } catch (error) {
      const visibleText = (await page.locator("body").innerText()).slice(
        0,
        2_000,
      );
      throw new Error(
        `Le viewer ne s'est pas chargé. Texte visible : ${visibleText}`,
        {
          cause: error,
        },
      );
    }
    if (await viewerError.isVisible()) {
      throw new Error(
        `Le viewer IFC a échoué : ${await viewerError.innerText()}`,
      );
    }
    await expect(stats).toContainText(/47\s*309\s*entités IFC/, {
      timeout: 120_000,
    });
    await expect(stats).toContainText(/223\s*maillages/);
  } finally {
    await gotoHydrated(page, projectHref);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Supprimer le projet" }).click();
    await expect(page).toHaveURL(/\/projets$/);
  }
});
