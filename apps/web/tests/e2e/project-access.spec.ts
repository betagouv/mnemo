import { expect, test } from "./fixtures";

test("lets a project owner create a reusable BCF role", async ({ page }) => {
  const name = `Accès test ${Date.now()}`;
  await page.goto("/projets");
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await page.getByLabel("Titre du dossier").fill(name);
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  const href = await page.getByRole("link", { name }).getAttribute("href");
  if (!href) throw new Error("Project URL missing");

  await page.goto(href);
  await page.getByRole("link", { name: "Accès au dossier" }).click();
  await expect(
    page.getByRole("heading", { name: `Accès à ${name}` }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Créer un rôle" }).click();
  await page.getByLabel("Nom du rôle").fill("Commentaire BCF");
  await page.getByText("Ajouter des commentaires BCF", { exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Ajouter des commentaires BCF" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Créer le rôle" }).click();
  await expect(
    page.getByRole("heading", { name: "Commentaire BCF" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Inviter une personne" }),
  ).toBeVisible();
});
