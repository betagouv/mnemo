import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";
import { gotoHydrated } from "./hydration";

const fixture = fileURLToPath(
  new URL("../fixtures/Ifc4_SampleHouse.ifc", import.meta.url),
);

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

test("navigates and snaps measurements on a real storey plan", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  await gotoHydrated(page, "/projets");
  const title = `Plan test ${Date.now()}`;
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await page.getByLabel("Titre du dossier").fill(title);
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  const href = await page
    .getByRole("link", { name: title, exact: true })
    .getAttribute("href");
  if (!href) throw new Error("Missing project URL");
  await gotoHydrated(page, href);
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.locator(`a[href="${href}/viewer"]`).click();
  await expect(
    page.locator('[role="status"]').filter({ hasText: "entités IFC" }),
  ).toBeVisible({ timeout: 120_000 });
  await page
    .getByRole("button", { name: "Autres outils", exact: true })
    .click();
  await page.getByRole("button", { name: "Vues en plan", exact: true }).click();
  const settings = page.getByRole("complementary", {
    name: "Vues en plan",
    exact: true,
  });
  await settings
    .getByLabel("Niveau", { exact: true })
    .selectOption({ label: "Ground Floor" });
  const plan = page.getByRole("group", {
    name: "Plan interactif du niveau Ground Floor",
    exact: true,
  });
  await expect(plan).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("button", { name: "Zoom +", exact: true }),
  ).toHaveCount(0);
  const canvas = page.getByLabel("Dessin du niveau Ground Floor", {
    exact: true,
  });
  // Use rendered ink, independent of GPU framing, to find a real snap target.
  const ink = await canvas.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const { width, height } = canvas;
    const data = canvas
      .getContext("2d")!
      .getImageData(0, 0, width, height).data;
    const points: { x: number; y: number }[] = [];
    const rect = canvas.getBoundingClientRect();
    for (let y = 10; y < height - 10; y += 2) {
      for (let x = 10; x < width - 10; x += 2) {
        const i = (y * width + x) * 4;
        if (data[i] < 50 && data[i + 1] < 50 && data[i + 2] < 50) {
          const point = {
            x: rect.left + (x * rect.width) / width,
            y: rect.top + (y * rect.height) / height,
          };
          if (
            !points.length ||
            Math.hypot(point.x - points[0].x, point.y - points[0].y) > 150
          )
            points.push(point);
          if (points.length === 2) return points;
        }
      }
    }
    return points;
  });
  expect(ink).toHaveLength(2);
  await page.getByRole("button", { name: "Mesurer", exact: true }).click();
  await page.mouse.move(ink[0].x + 2, ink[0].y + 2);
  await expect(page.getByText(/^(Sommet|Segment) accroché$/)).toBeVisible();
  await page.mouse.click(ink[0].x + 2, ink[0].y + 2);
  await page.mouse.move(ink[1].x, ink[1].y);
  await expect(page.getByText(/^(Sommet|Segment) accroché$/)).toBeVisible();
  await page.mouse.click(ink[1].x, ink[1].y);
  await expect(
    page.getByRole("status").filter({ hasText: /^1 mesure$/ }),
  ).toBeVisible();
  const checksum = () =>
    canvas.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const data = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261;
      for (let i = 0; i < data.length; i += 4)
        hash = Math.imul(hash ^ data[i], 16777619);
      return hash;
    });
  const defaultInk = await checksum();
  const style = settings.getByLabel("Style du plan", { exact: true });
  await style.selectOption("architectural");
  await expect.poll(checksum).not.toBe(defaultInk);
  await expect(
    page.getByRole("status").filter({ hasText: /^1 mesure$/ }),
  ).toBeVisible();
  for (const preset of ["fire-safety", "structural", "mep"])
    await style.selectOption(preset);
  await style.selectOption("default");
  await expect.poll(checksum).toBe(defaultInk);
  await page.mouse.wheel(0, -400);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(ink[1].x + 80, ink[1].y + 50, { steps: 12 });
  await page.mouse.up({ button: "middle" });
  await expect(
    page.getByRole("status").filter({ hasText: /^1 mesure$/ }),
  ).toBeVisible();
  await plan.press("Home");
  await page.screenshot({ path: "/tmp/mnemo-floor-plan.png" });
  await plan.press("Delete");
  await expect(
    page.getByRole("status").filter({ hasText: /^0 mesure$/ }),
  ).toBeVisible();
  await settings
    .getByRole("button", { name: "Règles personnalisées (0)", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Ajouter une règle", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Nouvelle règle", exact: true })
    .click();
  await settings
    .getByLabel("Nom de la règle", { exact: true })
    .fill("Murs rouges");
  await settings
    .getByLabel("Classe IFC", { exact: true })
    .selectOption("IfcWall");
  await settings.getByLabel("Remplissage", { exact: true }).fill("#ff0000");
  await settings
    .getByLabel("Épaisseur du trait", { exact: true })
    .selectOption("0.7");
  await expect.poll(checksum).not.toBe(defaultInk);
  await settings
    .getByRole("button", { name: "Enregistrer cette vue", exact: true })
    .click();
  const saveDialog = page.getByRole("dialog", {
    name: "Enregistrer une vue",
    exact: true,
  });
  await expect(
    saveDialog.getByLabel("Nom de la vue", { exact: true }),
  ).toHaveValue("Ground Floor");
  await saveDialog
    .getByLabel("Nom de la vue", { exact: true })
    .fill("RDC rouge");
  await saveDialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(saveDialog).not.toBeVisible();
  await expect(
    settings.getByRole("status").filter({ hasText: "Vue à jour" }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Télécharger le PDF", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  await download.saveAs("/tmp/mnemo-floor-plan.pdf");
  await page.reload();
  await expect(
    page.locator('[role="status"]').filter({ hasText: "entités IFC" }),
  ).toBeVisible({ timeout: 120_000 });
  await page
    .getByRole("button", { name: "Autres outils", exact: true })
    .click();
  await page.getByRole("button", { name: "Vues en plan", exact: true }).click();
  await settings
    .getByRole("combobox", { name: "Vue enregistrée", exact: true })
    .selectOption({ label: "RDC rouge" });
  await expect(plan).toBeVisible({ timeout: 60_000 });
  await settings
    .getByRole("button", { name: "Règles personnalisées (1)", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Murs rouges", exact: true })
    .click();
  await expect(settings.getByLabel("Remplissage", { exact: true })).toHaveValue(
    "#ff0000",
  );
  await expect(
    settings.getByLabel("Épaisseur du trait", { exact: true }),
  ).toHaveValue("0.7");
  await settings
    .getByRole("button", { name: "Règles personnalisées (1)", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 760 });
  await expect(settings.getByLabel("Niveau", { exact: true })).toBeInViewport();
  await expect(
    settings.getByLabel("Style du plan", { exact: true }),
  ).toBeInViewport();
  await expect(
    settings.getByRole("button", {
      name: "Enregistrer les modifications",
      exact: true,
    }),
  ).toBeInViewport();
  const dismiss = page.getByRole("button", {
    name: "Masquer le message",
    exact: true,
  });
  for (const button of await dismiss.all()) await button.click();
  await page.screenshot({
    path: "/tmp/mnemo-floor-plan-saved-light.png",
    animations: "disabled",
  });
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-fr-theme", "dark"),
  );
  await page.screenshot({
    path: "/tmp/mnemo-floor-plan-saved-dark.png",
    animations: "disabled",
  });
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-fr-theme", "light"),
  );
  const savedViewSelect = settings.getByRole("combobox", {
    name: "Vue enregistrée",
    exact: true,
  });
  const savedId = await savedViewSelect.inputValue();
  await settings
    .getByLabel("Niveau", { exact: true })
    .selectOption({ label: "Roof" });
  await expect(
    page.getByRole("group", {
      name: "Plan interactif du niveau Roof",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(savedViewSelect).toHaveValue(savedId);
  await expect(
    settings
      .getByRole("status")
      .filter({ hasText: "Modifications non enregistrées" }),
  ).toBeVisible();
  await settings
    .getByLabel("Niveau", { exact: true })
    .selectOption({ label: "Ground Floor" });
  await expect(plan).toBeVisible({ timeout: 60_000 });
  await expect(
    settings.getByRole("status").filter({ hasText: "Vue à jour" }),
  ).toBeVisible();
  await settings
    .getByRole("button", { name: "Supprimer la vue", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Confirmer la suppression", exact: true })
    .click();
  await expect(settings.getByText("Vue supprimée.")).toBeVisible();
  await page
    .getByRole("button", { name: "Retour à la 3D", exact: true })
    .click();
  await expect(plan).toHaveCount(0);
});
