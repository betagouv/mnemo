import { fileURLToPath } from "node:url";

import { expect, test } from "./fixtures";
import { gotoHydrated, waitForHydration } from "./hydration";

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

test("reveals the object picked in the scene inside the collapsed model tree", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const title = `Sélection arborescence ${Date.now()}`;
  await gotoHydrated(page, "/projets");
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await page.getByLabel("Titre du dossier").fill(title);
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  const href = await page
    .getByRole("link", { name: title, exact: true })
    .getAttribute("href");
  if (!href) throw new Error("Missing project URL");
  try {
    await gotoHydrated(page, href);
    await page.locator('input[type="file"]').setInputFiles(fixture);
    await page.locator(`a[href="${href}/viewer"]`).click();
    await expect(
      page.locator('canvas[aria-label^="Vue 3D"][data-phase="ready"]'),
    ).toBeVisible({ timeout: 120_000 });
    const notifications = page
      .locator('[aria-label="Notifications"]')
      .getByRole("button", { name: "Masquer le message" });
    while (await notifications.count()) await notifications.first().click();
    const tree = page.getByRole("complementary", {
      name: "Maquettes et relevés",
    });
    const model = tree.getByRole("button", {
      name: "Ifc4_SampleHouse.ifc",
      exact: true,
    });
    await model.click();
    await expect(model).toHaveAttribute("aria-expanded", "false");
    const canvas = page.locator('canvas[aria-label^="Vue 3D"]');
    const originalCanvas = await canvas.elementHandle();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Missing viewer viewport");
    const selected = tree.locator('button[aria-current="true"]');
    // The sample house is initially framed around its roof. Issue one pick and
    // await its result before any other selection, including on slow software GPUs.
    const pickedPoint = { x: bounds.width * 0.5, y: bounds.height * 0.5 };
    await canvas.click({ position: pickedPoint });
    await expect(selected).toHaveCount(1, { timeout: 30_000 });
    await expect(selected).toBeInViewport();
    await expect(model).toHaveAttribute("aria-expanded", "true");
    await expect(selected).toBeVisible();
    await expect(selected).not.toBeFocused();
    let selectedTitle = await selected.getAttribute("title");
    const selectedClass = await selected
      .locator("xpath=ancestor::div[@data-mode][1]")
      .locator(":scope > button[aria-expanded]")
      .elementHandle();
    if (!selectedClass) throw new Error("Missing selected class");
    await selectedClass.click();
    await expect
      .poll(() => selectedClass.getAttribute("aria-expanded"))
      .toBe("false");
    await tree.getByRole("tab", { name: /^Relevés/ }).click();
    await canvas.click({ position: pickedPoint });
    await expect(tree.getByRole("tab", { name: /^Relevés/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page
      .getByRole("button", {
        name: "Afficher dans l’arborescence",
        exact: true,
      })
      .click();
    await expect(tree.getByRole("tab", { name: /^Maquettes/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(selected).toBeInViewport();
    selectedTitle = await selected.getAttribute("title");

    // Select a second element from another branch without losing the scene pick.
    const floor = tree.getByRole("button", { name: /Ground Floor/ });
    if ((await floor.getAttribute("aria-expanded")) === "false")
      await floor.click();
    const walls = tree
      .locator("button")
      .filter({ has: page.locator('span[title^="IfcWall"]') })
      .first();
    if ((await walls.getAttribute("aria-expanded")) === "false")
      await walls.click();
    const other = tree
      .locator('[data-selected] > button[aria-pressed="false"]')
      .first();
    const otherTitle = await other.getAttribute("title");
    const otherButton = tree.getByTitle(otherTitle!, { exact: true });
    await otherButton.click({ modifiers: ["Control"] });
    await expect(otherButton).toHaveAttribute("aria-current", "true");
    await expect(otherButton).toBeInViewport();
    const selectedRows = tree.locator(
      '[data-selected] > button[aria-pressed="true"]',
    );
    await expect(selectedRows).toHaveCount(2);
    expect(
      await selectedRows.evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("title")),
      ),
    ).toEqual(expect.arrayContaining([selectedTitle, otherTitle]));
    const third = tree
      .locator('[data-selected] > button[aria-pressed="false"]:visible')
      .first();
    const thirdTitle = await third.getAttribute("title");
    const thirdButton = tree.getByTitle(thirdTitle!, { exact: true });
    await thirdButton.click({ modifiers: ["Control"] });
    await expect(thirdButton).toHaveAttribute("aria-pressed", "true");
    await expect(thirdButton).toBeInViewport();
    await expect(selectedRows).toHaveCount(3);
    // Contextual creation snapshots the complete selection and starts a fresh
    // draft only after the user accepts discarding an existing draft.
    const selectionCard = page.getByRole("complementary", {
      name: "Élément sélectionné",
      exact: true,
    });
    const createFromSelection = selectionCard.getByRole("button", {
      name: "Créer une remarque",
      exact: true,
    });
    await createFromSelection.click();
    const bcf = page.getByRole("complementary", {
      name: "Remarques BCF",
      exact: true,
    });
    await expect(
      bcf.getByRole("radio", {
        name: "Des objets de la maquette",
        exact: true,
      }),
    ).toBeChecked();
    await expect(
      bcf.getByText("Objets concernés (3)", { exact: true }),
    ).toBeVisible();
    await bcf
      .getByLabel("Titre", { exact: true })
      .fill("Brouillon à conserver");
    page.once("dialog", (dialog) => void dialog.dismiss());
    await createFromSelection.click();
    await expect(bcf.getByLabel("Titre", { exact: true })).toHaveValue(
      "Brouillon à conserver",
    );
    page.once("dialog", (dialog) => void dialog.accept());
    await createFromSelection.click();
    await expect(bcf.getByLabel("Titre", { exact: true })).toHaveValue("");
    await expect(
      bcf.getByText("Objets concernés (3)", { exact: true }),
    ).toBeVisible();
    page.once("dialog", (dialog) => void dialog.accept());
    await bcf.getByRole("button", { name: "Annuler", exact: true }).click();
    await bcf
      .getByRole("button", { name: "Nouvelle remarque", exact: true })
      .click();
    await expect(
      bcf.getByRole("radio", { name: "Le projet en général", exact: true }),
    ).toBeChecked();
    await bcf.getByRole("button", { name: "Annuler", exact: true }).click();
    await page
      .getByRole("button", { name: "Maquettes et relevés", exact: true })
      .click();
    // Resolve the canvas target again after tree scrolling and await actionability.
    await canvas.click({ position: pickedPoint, modifiers: ["Control"] });
    // The sample contains overlapping surfaces: whichever surface is hit,
    // Ctrl-click changes membership by one rather than replacing all three.
    await expect
      .poll(() => selectedRows.count(), { timeout: 30_000 })
      .not.toBe(3);
    expect([2, 4]).toContain(await selectedRows.count());
    await canvas.click({ position: pickedPoint });
    await expect(selectedRows).toHaveCount(1, { timeout: 30_000 });
    const treeTarget = tree
      .locator('[data-selected] > button[aria-pressed="false"]')
      .first();
    const treeTargetTitle = await treeTarget.getAttribute("title");
    await treeTarget.click();
    await expect(selectedRows).toHaveCount(1);
    await expect(selectedRows).toHaveAttribute("title", treeTargetTitle!);
    expect(
      await canvas.evaluate(
        (element, original) => element === original,
        originalCanvas,
      ),
    ).toBe(true);
    await selectionCard
      .getByRole("button", { name: "Voir les propriétés", exact: true })
      .click();
    const properties = selectionCard.getByRole("region", {
      name: "Propriétés de l’élément",
      exact: true,
    });
    await expect(
      properties.getByRole("button", { name: "Identification", exact: true }),
    ).toBeVisible();
    await expect(
      properties.getByText("Express ID", { exact: true }),
    ).toBeVisible();
    const inspector = await selectionCard.boundingBox();
    const propertyBounds = await properties.boundingBox();
    if (!inspector || !propertyBounds)
      throw new Error("Missing property inspector bounds");
    expect(propertyBounds.height).toBeGreaterThanOrEqual(
      inspector.height * 0.49,
    );
    expect(propertyBounds.height).toBeGreaterThan(250);
    await page.screenshot({
      path: test.info().outputPath("properties-light.png"),
    });
    await page.screenshot({
      path: test.info().outputPath("selection-light.png"),
    });
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-fr-theme", "dark"),
    );
    await expect(selected).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("selection-dark.png"),
    });
    await page.screenshot({
      path: test.info().outputPath("properties-dark.png"),
    });
    await selectionCard
      .getByRole("button", { name: "Réduire les propriétés", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Filtres et couleurs", exact: true })
      .click();
    const filters = page.getByRole("complementary", {
      name: "Filtres et couleurs",
      exact: true,
    });
    await filters
      .getByLabel("Classe IFC", { exact: true })
      .selectOption("IfcWall");
    await page.getByRole("button", { name: "Coupes", exact: true }).click();
    await page
      .getByRole("button", { name: "Filtres et couleurs", exact: true })
      .click();
    await expect(filters.getByLabel("Classe IFC", { exact: true })).toHaveValue(
      "IfcWall",
    );
    await filters.getByRole("button", { name: "Isoler", exact: true }).click();
    await page.getByRole("button", { name: "Coupes", exact: true }).click();
    await page.getByText("Coupe active", { exact: true }).click();
    await selectionCard
      .getByRole("button", { name: "Masquer", exact: true })
      .click();
    const modifiers = page.getByLabel("Modificateurs actifs", { exact: true });
    await expect(
      modifiers.getByRole("button", { name: /^Retirer / }),
    ).toHaveCount(3);
    const modifierLayout = await modifiers.evaluate((element) => ({
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(modifierLayout.scrollHeight).toBeLessThanOrEqual(
      modifierLayout.height + 1,
    );
    expect(modifierLayout.scrollWidth).toBeLessThanOrEqual(
      modifierLayout.width + 1,
    );
    await page.screenshot({
      path: test.info().outputPath("modifiers-dark.png"),
    });
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-fr-theme", "light"),
    );
    await page.screenshot({
      path: test.info().outputPath("modifiers-light.png"),
    });
    await page
      .getByRole("button", { name: "Fermer le panneau", exact: true })
      .click();
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      const toolbar = page.getByRole("group", {
        name: "Outils de la visionneuse",
        exact: true,
      });
      const toolbarBounds = await toolbar.boundingBox();
      const modifierBounds = await modifiers.boundingBox();
      if (!toolbarBounds || !modifierBounds)
        throw new Error("Missing toolbar or modifier bounds");
      expect(modifierBounds.x).toBeGreaterThan(
        toolbarBounds.x + toolbarBounds.width,
      );
      await expect(
        modifiers.getByRole("button", { name: /^Retirer / }),
      ).toHaveCount(3);
      expect(
        await canvas.evaluate(
          (element, original) => element === original,
          originalCanvas,
        ),
      ).toBe(true);
    }
    await page.screenshot({
      path: test.info().outputPath("modifiers-closed-light.png"),
    });
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-fr-theme", "dark"),
    );
    await page.screenshot({
      path: test.info().outputPath("modifiers-closed-dark.png"),
    });
  } catch (error) {
    console.error(error);
    console.error(await page.locator("main").ariaSnapshot());
    await page
      .screenshot({
        path: test.info().outputPath("selection-error.png"),
        timeout: 5_000,
      })
      .catch((captureError: unknown) => console.error(captureError));
    throw error;
  } finally {
    await page.close();
    const cleanup = await page.context().newPage();
    cleanup.setDefaultTimeout(15_000);
    cleanup.setDefaultNavigationTimeout(30_000);
    try {
      await cleanup.goto(href, { waitUntil: "domcontentloaded" });
      await waitForHydration(cleanup);
      cleanup.once("dialog", (dialog) => void dialog.accept());
      await cleanup
        .getByRole("button", { name: "Supprimer le projet" })
        .click();
      await expect(cleanup).toHaveURL(/\/projets$/);
    } finally {
      await cleanup.close();
    }
  }
});
