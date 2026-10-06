import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./hydration";

test("opens viewer tools in a reusable side panel", async ({ page }) => {
  const projectName = `Outils visionneuse ${Date.now()}`;

  await gotoHydrated(page, "/projets");
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await page.getByLabel("Titre du dossier").fill(projectName);
  await page.getByRole("button", { name: "Créer le dossier" }).click();

  const projectHref = await page
    .getByRole("link", { name: projectName })
    .getAttribute("href");
  if (!projectHref) throw new Error("The created project has no URL");

  try {
    await gotoHydrated(page, `${projectHref}/viewer`);
    const tools = page.getByRole("group", { name: "Outils de la visionneuse" });
    const sidePanel = page.getByRole("complementary", {
      name: "Coupe par plan",
    });

    await expect(tools.getByRole("button", { name: "Coupes" })).toBeVisible();
    await expect(sidePanel).not.toBeVisible();

    await tools.getByRole("button", { name: "Coupes" }).click();
    await expect(
      tools.getByRole("button", { name: "Coupe par plan" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      tools.getByRole("button", { name: "Coupe par plan" }),
    ).not.toBeVisible();
    await expect(tools.getByRole("button", { name: "Coupes" })).toBeFocused();
    await tools.getByRole("button", { name: "Coupes" }).click();
    await tools.getByRole("button", { name: "Coupe par plan" }).click();
    await expect(sidePanel).toBeVisible();
    await expect(
      sidePanel.getByRole("heading", { name: "Outil en préparation" }),
    ).toBeVisible();

    await tools.getByRole("button", { name: "Mesures" }).click();
    await tools.getByRole("button", { name: "Distance" }).click();
    const measurementPanel = page.getByRole("complementary", {
      name: "Mesure de distance",
    });
    await expect(measurementPanel).toBeVisible();
    await measurementPanel
      .getByRole("button", { name: "Fermer le panneau" })
      .click();
    await expect(measurementPanel).not.toBeVisible();
    await expect(tools.getByRole("button", { name: "Mesures" })).toBeFocused();

    await tools.getByRole("button", { name: "Données" }).click();
    await tools.getByRole("button", { name: "Propriétés IFC" }).click();
    await expect(
      page.getByRole("complementary", { name: "Propriétés IFC" }),
    ).toBeVisible();
    await tools.getByRole("button", { name: "Annotations" }).click();
    await expect(
      page.getByRole("complementary", { name: "Remarques BCF" }),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const mobilePanel = page.getByRole("complementary", {
      name: "Remarques BCF",
    });
    await expect(mobilePanel).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await mobilePanel
      .getByRole("button", { name: "Fermer le panneau" })
      .click();
    await expect(mobilePanel).not.toBeVisible();
  } finally {
    await gotoHydrated(page, projectHref);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Supprimer le projet" }).click();
    await expect(page).toHaveURL(/\/projets$/);
  }
});
