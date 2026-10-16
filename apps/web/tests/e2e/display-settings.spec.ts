import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./hydration";

test("persists light, dark and system display settings across pages", async ({
  page,
}) => {
  await gotoHydrated(page, "/");
  await page
    .getByRole("contentinfo")
    .getByRole("button", { name: "Paramètres d'affichage" })
    .click();

  const dialog = page.getByRole("dialog", {
    name: "Paramètres d'affichage",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByText("Thème sombre", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-fr-theme", "dark");

  await gotoHydrated(page, "/projets");
  await expect(page.locator("html")).toHaveAttribute("data-fr-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-fr-theme", "dark");

  await page
    .getByRole("contentinfo")
    .getByRole("button", { name: "Paramètres d'affichage" })
    .click();
  await dialog.getByText("Thème clair", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-fr-theme", "light");

  await page.emulateMedia({ colorScheme: "dark" });
  await dialog.locator("label", { hasText: /^Système/ }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-fr-scheme",
    "system",
  );
  await expect(page.locator("html")).toHaveAttribute("data-fr-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-fr-theme", "light");
});

test("opens display settings from the compact viewer footer", async ({
  page,
}) => {
  const projectName = `Thème viewer ${Date.now()}`;
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
    await page
      .getByRole("contentinfo")
      .getByRole("button", { name: "Paramètres d'affichage" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Paramètres d'affichage",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByText("Thème sombre", { exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-fr-theme", "dark");
    await dialog.getByRole("button", { name: "Fermer" }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    const themeButton = page.getByRole("contentinfo").getByRole("button", {
      name: "Paramètres d'affichage",
    });
    await expect(themeButton).toBeVisible();
    const fitsFooter = await themeButton.evaluate((button) => {
      const footer = button.closest("footer");
      if (!footer) return false;
      const footerRect = footer.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return (
        buttonRect.top >= footerRect.top &&
        buttonRect.bottom <= footerRect.bottom &&
        buttonRect.right <= footerRect.right
      );
    });
    expect(fitsFooter).toBe(true);
    await themeButton.click();
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await gotoHydrated(page, projectHref);
    page.once("dialog", (nativeDialog) => void nativeDialog.accept());
    await page.getByRole("button", { name: "Supprimer le projet" }).click();
    await expect(page).toHaveURL(/\/projets$/);
  }
});
