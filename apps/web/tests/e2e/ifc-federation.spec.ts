import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { gotoHydrated } from "./hydration";

test.use({
  viewport: { width: 1440, height: 1000 },
  launchOptions: {
    args: [
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan",
      "--use-vulkan=swiftshader",
      "--use-angle=swiftshader",
      "--disable-vulkan-surface",
      "--ignore-gpu-blocklist",
      "--enable-gpu",
    ],
  },
});

const fixture = (name: string) =>
  readFile(
    new URL(`../fixtures/federation/${name}.ifc`, import.meta.url),
    "utf8",
  );

test("superimposes georeferenced IFCs, reports local ones and recovers a failed load", async ({
  page,
}) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(30_000);
  const title = `Géoréférencement ${Date.now()}`;
  await gotoHydrated(page, "/projets");
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await page.getByLabel("Titre du dossier").fill(title);
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  const href = await page
    .getByRole("link", { name: title, exact: true })
    .getAttribute("href");
  if (!href) throw new Error("Project URL missing");
  const upload = async (name: string, contents: string) => {
    await gotoHydrated(page, href);
    await expect(page.locator('input[type="file"]')).toBeEnabled();
    await page.locator('input[type="file"]').setInputFiles({
      name,
      mimeType: "application/octet-stream",
      buffer: Buffer.from(contents),
    });
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  };
  const canvas = page.locator(
    'canvas[aria-label^="Vue 3D"][data-phase="ready"]',
  );
  const warning = page
    .getByLabel("Notifications")
    .getByText("Maquettes à vérifier");
  const openLayers = () =>
    page
      .getByRole("button", { name: "Maquettes et relevés", exact: true })
      .click();
  const frame = (name: string) =>
    page.getByRole("button", { name: `Cadrer ${name}`, exact: true });
  try {
    await upload("Lambert-93.ifc", await fixture("01-reference-lambert93"));
    await upload("Pivotée.ifc", await fixture("03-lambert93-rotated"));
    await upload("CC49.ifc", await fixture("04-rgf93-cc49"));
    await upload("UTM.ifc", await fixture("05-utm31n"));
    await upload("Absolue.ifc", await fixture("06-absolute-coordinates"));
    await gotoHydrated(page, `${href}/viewer`);
    await expect(canvas).toBeVisible({ timeout: 120_000 });
    await openLayers();
    for (const name of [
      "Lambert-93.ifc",
      "Pivotée.ifc",
      "CC49.ifc",
      "UTM.ifc",
      "Absolue.ifc",
    ])
      await expect(frame(name)).toBeEnabled();
    await expect(warning).toHaveCount(0);

    await upload(
      "Locale.ifc",
      (await fixture("02-lambert93")).replace(
        /#3[67]=IFC(PROJECTEDCRS|MAPCONVERSION).*;/g,
        "",
      ),
    );
    // The first model fails; the project frame keeps the others in place.
    let blocked = 0;
    await page.route("**/access", async (route) => {
      if (blocked++ === 0) await route.abort();
      else await route.continue();
    });
    await gotoHydrated(page, `${href}/viewer`);
    const partial = page.getByRole("alert").filter({
      hasText: "Chargement partiel",
    });
    await expect(partial).toContainText("Lambert-93.ifc", { timeout: 60_000 });
    await expect(warning).toBeVisible({ timeout: 60_000 });
    await openLayers();
    await expect(frame("Locale.ifc")).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByText("Chargement en cours…")).toHaveCount(0);
    await expect(
      page.getByLabel("Notifications").getByText(/Locale\.ifc/),
    ).toBeVisible();
    await expect(
      page.getByLabel("Notifications").getByText(/UTM\.ifc/),
    ).toHaveCount(0);
    await partial.getByRole("button", { name: "Réessayer" }).click();
    await expect(frame("Lambert-93.ifc")).toBeEnabled({ timeout: 60_000 });
    await expect(partial).toHaveCount(0);
  } finally {
    await gotoHydrated(page, href);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Modifier le dossier" }).click();
    await page.getByRole("button", { name: "Supprimer le dossier" }).click();
    await expect(page).toHaveURL(/\/projets$/);
  }
});
