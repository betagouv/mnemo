import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
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

test("persists named filter groups, duplicates and independent activation", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const title = `Filtres IFC ${Date.now()}`;
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
    await expect(
      page.getByRole("heading", { name: "Ifc4_SampleHouse.ifc", exact: true }),
    ).toBeVisible();
    await gotoHydrated(page, href);
    await expect(
      page.getByRole("button", {
        name: "Sélectionner un fichier",
        exact: true,
      }),
    ).toBeEnabled();
    await page.locator('input[type="file"]').setInputFiles({
      name: "Second.ifc",
      mimeType: "application/octet-stream",
      buffer: await readFile(fixture),
    });
    await expect(
      page.getByRole("heading", { name: "Second.ifc", exact: true }),
    ).toBeVisible();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    await gotoHydrated(page, `${href}/viewer`);
    const canvas = page.locator(
      'canvas[aria-label^="Vue 3D"][data-phase="ready"]',
    );
    await expect(canvas).toBeVisible({ timeout: 120_000 });
    const originalCanvas = await canvas.elementHandle();
    const notifications = page
      .locator('[aria-label="Notifications"]')
      .getByRole("button", { name: "Masquer le message" });
    while (await notifications.count()) await notifications.first().click();
    const tools = page.getByRole("group", { name: "Outils de la visionneuse" });
    const filterTool = tools.getByRole("button", {
      name: "Filtres IFC",
      exact: true,
    });
    const filterBadge = filterTool.getByText(/^\d+$/);
    await filterTool.click();
    const panel = page.getByRole("complementary", {
      name: "Filtres IFC",
      exact: true,
    });
    const group = panel.getByRole("region", {
      name: "Groupe Mes filtres",
      exact: true,
    });
    const palette = panel.getByRole("region", {
      name: "Groupe Couleurs par niveau",
      exact: true,
    });
    const form = group.getByRole("form", { name: /un filtre/ });
    const rules = group.getByRole("list", { name: "Filtres configurés" });
    const classes = group.getByRole("combobox", {
      name: "Classes IFC",
      exact: true,
    });
    const levels = group.getByRole("combobox", {
      name: "Niveaux",
      exact: true,
    });
    const selectOption = async (input: typeof classes, value: string) => {
      await input.fill(value);
      await page.getByRole("option", { name: value, exact: true }).click();
      await expect(input).toHaveAttribute("aria-expanded", "true");
      await input.press("Escape");
    };
    const toggle = async (checkbox: ReturnType<typeof panel.getByRole>) =>
      checkbox.locator("..").locator("label").click();
    await expect(
      panel.getByRole("slider", { name: "Opacité du contexte" }),
    ).not.toBeVisible();
    await expect(
      palette.getByRole("checkbox", { name: /^Activer le groupe/ }),
    ).not.toBeChecked();
    await expect(filterBadge).toHaveCount(0);
    expect((await form.boundingBox())!.height).toBeLessThan(360);
    await selectOption(classes, "IfcWall");
    await classes.fill("IfcDoor");
    await classes.press("Enter");
    await expect(
      page.getByRole("option", { name: "IfcWall", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await classes.press("Escape");
    await expect(
      group.getByRole("button", {
        name: "Retirer IfcWall de Classes IFC",
        exact: true,
      }),
    ).toBeVisible();
    const doorChip = group.getByRole("button", {
      name: "Retirer IfcDoor de Classes IFC",
      exact: true,
    });
    await doorChip.click();
    await expect(doorChip).toHaveCount(0);
    await expect(classes).toHaveAttribute("aria-expanded", "false");
    await expect(
      group.getByRole("button", {
        name: "Retirer IfcWall de Classes IFC",
        exact: true,
      }),
    ).toBeFocused();
    await classes.focus();
    await classes.press("ArrowDown");
    await expect(classes).toHaveAttribute("aria-expanded", "true");
    await selectOption(classes, "IfcDoor");
    await selectOption(levels, "Ground Floor · Ifc4_SampleHouse.ifc");
    await selectOption(levels, "Ground Floor · Second.ifc");
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) =>
          document.documentElement.setAttribute("data-fr-theme", value),
        theme,
      );
      await page.screenshot({
        path: `/tmp/mnemo-84-chips-editor-${theme}.png`,
      });
    }
    await form
      .getByRole("button", { name: "Ajouter le filtre", exact: true })
      .click();
    await expect(rules.getByRole("listitem")).toHaveCount(1);
    await expect(filterBadge).toHaveText("1");
    await expect(filterTool).toHaveAccessibleDescription(
      "1 groupe de filtres actif",
    );
    const parent = group.getByRole("checkbox", { name: /^Activer le groupe/ });
    await page
      .getByRole("button", { name: "Retirer 1 filtre actif", exact: true })
      .click();
    await expect(parent).not.toBeChecked();
    await expect(filterBadge).toHaveCount(0);
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(parent).toBeChecked();
    await expect(filterBadge).toHaveText("1");
    await expect(
      page.getByRole("button", { name: "Retirer 1 filtre actif", exact: true }),
    ).toBeVisible();
    await toggle(parent);
    await expect(
      page.getByRole("button", { name: "Retirer 1 filtre actif", exact: true }),
    ).toHaveCount(0);
    await expect(filterBadge).toHaveCount(0);
    await toggle(parent);
    await expect(filterBadge).toHaveText("1");
    await group
      .getByRole("button", { name: "Ajouter un filtre", exact: true })
      .click();
    await expect(classes).toBeFocused();
    await expect(classes).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await selectOption(classes, "IfcWall");
    await form.getByText("Coloriser", { exact: true }).click();
    await form
      .getByRole("button", { name: "Ajouter le filtre", exact: true })
      .click();
    let color = rules.getByRole("listitem", { name: /^Coloriser/ });
    await color.getByRole("button", { name: /^Modifier/ }).click();
    await expect(classes).toHaveAttribute("aria-expanded", "false");
    await expect(
      group.getByRole("button", {
        name: "Retirer IfcWall de Classes IFC",
        exact: true,
      }),
    ).toBeVisible();
    await form
      .getByRole("button", { name: "Annuler le filtre", exact: true })
      .click();
    await color.getByRole("button", { name: /^Dupliquer/ }).click();
    await expect(rules.getByRole("listitem")).toHaveCount(3);
    await expect(filterBadge).toHaveText("1");
    await expect(classes).toBeFocused();
    await group
      .getByRole("button", { name: "Vider Classes IFC", exact: true })
      .click();
    await selectOption(classes, "IfcDoor");
    await form
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    color = rules.getByRole("listitem", {
      name: "Coloriser · IfcDoor",
      exact: true,
    });
    await toggle(color.getByRole("checkbox"));
    await expect(color.getByRole("checkbox")).not.toBeChecked();
    await toggle(group.getByRole("checkbox", { name: /^Activer le groupe/ }));
    await expect(filterBadge).toHaveCount(0);
    await expect(
      rules.getByRole("checkbox", { name: /^Isoler/ }),
    ).toBeChecked();
    await toggle(group.getByRole("checkbox", { name: /^Activer le groupe/ }));
    await expect(filterBadge).toHaveText("1");
    await expect(color.getByRole("checkbox")).not.toBeChecked();
    await group
      .getByLabel("Actions du groupe Mes filtres", { exact: true })
      .click();
    await group.getByTitle("Renommer Mes filtres", { exact: true }).click();
    await group.getByLabel("Nom du groupe").fill("Structure");
    await group.getByRole("button", { name: "Renommer", exact: true }).click();
    const structure = panel.getByRole("region", {
      name: "Groupe Structure",
      exact: true,
    });
    await structure
      .getByLabel("Actions du groupe Structure", { exact: true })
      .click();
    await structure
      .getByTitle("Dupliquer le groupe Structure", { exact: true })
      .click();
    const copy = panel.getByRole("region", {
      name: "Groupe Structure (copie)",
      exact: true,
    });
    await expect(
      copy
        .getByRole("list", { name: "Filtres configurés" })
        .getByRole("listitem"),
    ).toHaveCount(3);
    await expect(filterBadge).toHaveText("2");
    await expect(filterTool).toHaveAccessibleDescription(
      "2 groupes de filtres actifs",
    );
    await copy
      .getByLabel("Actions du groupe Structure (copie)", { exact: true })
      .click();
    await copy
      .getByTitle("Supprimer le groupe Structure (copie)", { exact: true })
      .click();
    await expect(copy).toHaveCount(0);
    await expect(filterBadge).toHaveText("1");
    await panel
      .getByRole("button", { name: "Créer un groupe", exact: true })
      .click();
    const newGroup = panel.getByRole("form", {
      name: "Nouveau groupe",
      exact: true,
    });
    await newGroup.getByLabel("Nom du groupe").fill("Portes");
    await newGroup
      .getByRole("button", { name: "Créer le groupe", exact: true })
      .click();
    const doors = panel.getByRole("region", {
      name: "Groupe Portes",
      exact: true,
    });
    await doors
      .getByRole("button", {
        name: "Retirer Ifc4_SampleHouse.ifc de Maquettes ciblées",
        exact: true,
      })
      .click();
    await selectOption(
      doors.getByRole("combobox", { name: "Classes IFC", exact: true }),
      "IfcDoor",
    );
    await doors.getByText("Masquer", { exact: true }).click();
    await doors
      .getByRole("button", { name: "Ajouter le filtre", exact: true })
      .click();
    await expect(filterBadge).toHaveText("2");
    await toggle(doors.getByRole("checkbox", { name: /^Activer le groupe/ }));
    await expect(filterBadge).toHaveText("1");
    await palette
      .getByRole("button", { name: "Déplier Couleurs par niveau", exact: true })
      .click();
    await expect(
      palette
        .getByRole("list", { name: "Filtres configurés" })
        .getByRole("listitem"),
    ).toHaveCount(4);
    await toggle(palette.getByRole("checkbox", { name: /^Activer le groupe/ }));
    await expect(filterBadge).toHaveText("2");
    await toggle(palette.getByRole("checkbox", { name: /^Activer le groupe/ }));
    await expect(filterBadge).toHaveText("1");
    await palette
      .getByRole("button", { name: "Replier Couleurs par niveau", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Réglages du contexte", exact: true })
      .click();
    await expect(
      panel.getByRole("slider", { name: "Opacité du contexte" }),
    ).toBeVisible();
    await panel.getByRole("slider", { name: "Opacité du contexte" }).fill("24");
    await panel
      .getByRole("button", { name: "Réglages du contexte", exact: true })
      .click();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) =>
          document.documentElement.setAttribute("data-fr-theme", value),
        theme,
      );
      await page.mouse.move(700, 500);
      await page.screenshot({ path: `/tmp/mnemo-84-groups-${theme}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await panel.boundingBox();
    for (const button of await structure.getByRole("button").all()) {
      if (!(await button.isVisible())) continue;
      const buttonBounds = await button.boundingBox();
      expect(buttonBounds!.x + buttonBounds!.width).toBeLessThanOrEqual(
        bounds!.x + bounds!.width,
      );
    }
    const save = panel
      .locator("footer")
      .getByRole("button", { name: "Enregistrer", exact: true });
    await expect(save).toBeInViewport();
    await page.screenshot({ path: "/tmp/mnemo-84-groups-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await tools
      .getByRole("button", { name: "Maquettes et relevés", exact: true })
      .click();
    const explorer = page.getByRole("complementary", {
      name: "Maquettes et relevés",
      exact: true,
    });
    await expect(
      explorer.getByRole("button", {
        name: /^(Maquette active|Définir comme maquette active|Activer pour les filtres)$/,
      }),
    ).toHaveCount(0);
    // Selecting an object automatically chooses its model without changing filters.
    for (const fileName of ["Second.ifc", "Ifc4_SampleHouse.ifc"]) {
      const disclosure = explorer.getByRole("button", {
        name: fileName,
        exact: true,
      });
      if ((await disclosure.getAttribute("aria-expanded")) === "false")
        await disclosure.click();
      const body = page.locator(
        `[id="${await disclosure.getAttribute("aria-controls")}"]`,
      );
      const floor = body.getByRole("button", { name: /Ground Floor/ });
      if ((await floor.getAttribute("aria-expanded")) === "false")
        await floor.click();
      const walls = body
        .locator("button")
        .filter({ has: page.locator('span[title="IfcWall"]') });
      if ((await walls.getAttribute("aria-expanded")) === "false")
        await walls.click();
      const element = body
        .locator("[data-selected] > button[aria-pressed]")
        .first();
      await element.click();
      await expect(element).toHaveAttribute("aria-current", "true");
      await expect(filterBadge).toHaveText("1");
    }
    await filterTool.click();
    await expect(filterBadge).toHaveText("1");
    await expect(
      structure.getByRole("checkbox", { name: /^Activer le groupe/ }),
    ).toBeChecked();
    await expect(save).toBeEnabled();
    expect(
      await canvas.evaluate(
        (node, original) => node === original,
        originalCanvas,
      ),
    ).toBe(true);
    // A failed save retains the local draft and can be retried.
    await page.route("**/viewer", async (route) => {
      if (route.request().method() === "POST") await route.abort();
      else await route.continue();
    });
    await save.click();
    await expect(panel.getByText(/Enregistrement impossible/)).toBeVisible();
    await page.unroute("**/viewer");
    await save.click();
    await expect(
      panel.getByText("Filtres enregistrés dans le dossier.", { exact: true }),
    ).toBeVisible();
    await expect(save).toBeDisabled();
    await expect(
      structure
        .getByRole("list", {
          name: "Sélection de Maquettes ciblées",
          exact: true,
        })
        .getByRole("button"),
    ).toHaveCount(2);
    await expect(
      structure.getByRole("checkbox", { name: /^Activer le groupe/ }),
    ).toBeChecked();
    await expect(save).toBeDisabled();
    await gotoHydrated(page, `${href}/viewer`);
    await expect(canvas).toBeVisible({ timeout: 120_000 });
    await expect(filterBadge).toHaveText("1");
    await tools
      .getByRole("button", { name: "Filtres IFC", exact: true })
      .click();
    await expect(
      structure.getByRole("checkbox", { name: /^Activer le groupe/ }),
    ).toBeChecked();
    await expect(
      structure
        .getByRole("list", {
          name: "Sélection de Maquettes ciblées",
          exact: true,
        })
        .getByRole("button"),
    ).toHaveCount(2);
    await expect(
      structure
        .getByRole("list", { name: "Filtres configurés" })
        .getByRole("listitem"),
    ).toHaveCount(3);
    await expect(
      structure.getByRole("checkbox", {
        name: "Coloriser · IfcDoor",
        exact: true,
      }),
    ).not.toBeChecked();
    await expect(
      doors.getByRole("checkbox", { name: /^Activer le groupe/ }),
    ).not.toBeChecked();
    await expect(
      palette.getByRole("checkbox", { name: /^Activer le groupe/ }),
    ).not.toBeChecked();
    await expect(
      page
        .locator('[aria-label="Modificateurs actifs"]')
        .getByRole("button", { name: /^2 filtres actifs/ }),
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "Réglages du contexte", exact: true })
      .click();
    await expect(
      panel.getByRole("slider", { name: "Opacité du contexte" }),
    ).toHaveValue("24");
    await panel
      .getByRole("button", { name: "Réglages du contexte", exact: true })
      .click();
    await page
      .locator('[aria-label="Modificateurs actifs"]')
      .getByRole("button", { name: /^Retirer/ })
      .click();
    await expect(
      structure.getByRole("checkbox", { name: /^Activer le groupe/ }),
    ).not.toBeChecked();
    await expect(
      structure
        .getByRole("list", { name: "Filtres configurés" })
        .getByRole("listitem"),
    ).toHaveCount(3);
    await expect(filterBadge).toHaveCount(0);
    await structure
      .getByRole("list", { name: "Filtres configurés" })
      .getByRole("listitem", { name: /^Isoler/ })
      .getByRole("button", { name: /^Modifier/ })
      .click();
    while (await notifications.count()) await notifications.first().click();
    await page
      .getByRole("button", { name: "Fermer le message", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    const selectedClasses = structure.getByRole("list", {
      name: "Sélection de Classes IFC",
      exact: true,
    });
    await selectedClasses.scrollIntoViewIfNeeded();
    await expect(selectedClasses.getByRole("button")).toHaveCount(2);
    const chipBounds = await selectedClasses.boundingBox();
    expect(chipBounds!.x + chipBounds!.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: "/tmp/mnemo-84-chips-mobile.png" });
    await structure
      .getByRole("form")
      .getByRole("button", { name: "Annuler le filtre", exact: true })
      .click();
    expect(errors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: "/tmp/mnemo-84-groups-failure.png" });
    throw error;
  } finally {
    await gotoHydrated(page, href);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Supprimer le projet" }).click();
    await expect(page).toHaveURL(/\/projets$/);
  }
});
