import { expect, test } from "./fixtures";

test("protects dossiers and lets a user sign out", async ({ page }) => {
  await page.goto("/projets");
  await expect(
    page.getByRole("heading", { name: "Mes dossiers" }),
  ).toBeVisible();

  await page.goto("/compte");
  await expect(page.getByRole("heading", { name: "Mon compte" })).toBeVisible();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/connexion/);

  await page.goto("/projets");
  await expect(page).toHaveURL(/\/connexion/);
  await expect(
    page.getByRole("heading", { name: "Se connecter" }),
  ).toBeVisible();
});
