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

test("builds and edits compact filter rules with searchable multi-selects", async ({
  page,
}) => {
  test.setTimeout(180_000);
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
    await page.locator(`a[href="${href}/viewer"]`).click();
    const canvas = page.locator(
      'canvas[aria-label^="Vue 3D"][data-phase="ready"]',
    );
    await expect(canvas).toBeVisible({ timeout: 120_000 });
    const originalCanvas = await canvas.elementHandle();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    const notifications = page
      .locator('[aria-label="Notifications"]')
      .getByRole("button", { name: "Masquer le message" });
    while (await notifications.count()) await notifications.first().click();
    const tools = page.getByRole("group", { name: "Outils de la visionneuse" });
    await tools
      .getByRole("button", { name: "Filtres IFC", exact: true })
      .click();
    const panel = page.getByRole("complementary", {
      name: "Filtres IFC",
      exact: true,
    });
    const form = panel.getByRole("form");
    const rules = panel.getByRole("list", { name: "Filtres configurés" });
    const classes = panel.getByRole("combobox", {
      name: "Classes IFC",
      exact: true,
    });
    const levels = panel.getByRole("combobox", {
      name: "Niveaux",
      exact: true,
    });
    const selectOption = async (input: typeof classes, value: string) => {
      await input.fill(value);
      await page.getByRole("option", { name: value, exact: true }).click();
      await expect(input).toHaveAttribute("aria-expanded", "true");
      await input.press("Escape");
    };
    const formBounds = await form.boundingBox();
    expect(formBounds!.height).toBeLessThan(360);
    await expect(
      panel.getByRole("button", { name: "Ajouter le filtre", exact: true }),
    ).toBeDisabled();
    await selectOption(classes, "IfcWall");
    await classes.fill("IfcDoor");
    await classes.press("Enter");
    await expect(
      page.getByRole("option", { name: "IfcWall", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("option", { name: "IfcDoor", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await classes.press("Escape");
    await selectOption(levels, "Ground Floor");
    await selectOption(levels, "Roof");
    await levels.blur();
    await page.screenshot({ path: "/tmp/mnemo-74-editor-light.png" });
    await panel
      .getByRole("button", { name: "Ajouter le filtre", exact: true })
      .click();
    await expect(rules.getByRole("listitem")).toHaveCount(1);
    await expect(form).toHaveCount(0);
    const isolation = rules.getByRole("listitem", { name: /^Isoler/ });
    await expect(isolation).toContainText("IfcWall, IfcDoor");
    await expect(isolation).toContainText("Ground Floor, Roof");

    await panel
      .getByRole("button", { name: "Ajouter un filtre", exact: true })
      .click();
    await selectOption(classes, "IfcWall");
    await form.getByText("Coloriser", { exact: true }).click();
    await panel
      .getByRole("button", { name: "Ajouter le filtre", exact: true })
      .click();
    await expect(rules.getByRole("listitem")).toHaveCount(2);
    let colored = rules.getByRole("listitem", { name: /^Coloriser/ });
    await colored.getByRole("button", { name: /^Modifier/ }).click();
    await expect(classes).toBeFocused();
    await expect(classes).toHaveAccessibleDescription(/IfcWall/);
    await panel
      .getByRole("button", { name: "Vider Classes IFC", exact: true })
      .click();
    await selectOption(classes, "IfcDoor");
    await form
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    colored = rules.getByRole("listitem", { name: /^Coloriser/ });
    await expect(colored).toContainText("IfcDoor");
    await colored.getByRole("checkbox").locator("..").locator("label").click();
    await expect(colored.getByRole("checkbox")).not.toBeChecked();
    await expect(isolation.getByRole("checkbox")).toBeChecked();
    await colored.getByRole("checkbox").locator("..").locator("label").click();
    await expect(colored.getByRole("checkbox")).toBeChecked();

    await panel
      .getByRole("button", { name: "Ajouter un filtre", exact: true })
      .click();
    await selectOption(classes, "IfcDoor");
    await form.getByText("Masquer", { exact: true }).click();
    await panel
      .getByRole("button", { name: "Ajouter le filtre", exact: true })
      .click();
    await expect(rules.getByRole("listitem")).toHaveCount(3);
    await rules
      .getByRole("listitem", { name: /^Masquer/ })
      .getByRole("button", { name: /^Supprimer/ })
      .click();
    await expect(rules.getByRole("listitem")).toHaveCount(2);
    const deletes = await rules
      .getByRole("button", { name: /^Supprimer/ })
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getBoundingClientRect().right),
      );
    expect(deletes[0]).toBe(deletes[1]);
    await tools.getByRole("button", { name: "Coupes", exact: true }).click();
    await tools
      .getByRole("button", { name: "Filtres IFC", exact: true })
      .click();
    await expect(rules.getByRole("listitem")).toHaveCount(2);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) =>
          document.documentElement.setAttribute("data-fr-theme", value),
        theme,
      );
      await page.mouse.move(700, 500);
      await page.screenshot({ path: `/tmp/mnemo-74-rules-${theme}.png` });
    }
    await panel
      .getByRole("button", { name: "Ajouter un filtre", exact: true })
      .click();
    await classes.fill("introuvable");
    await expect(
      page.getByText("Aucun résultat", { exact: true }),
    ).toBeVisible();
    await classes.press("Escape");
    await classes.fill("IfcWall");
    await page.screenshot({ path: "/tmp/mnemo-74-dropdown.png" });
    await classes.press("Escape");
    await form
      .getByRole("button", { name: "Annuler le filtre", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await panel
      .getByRole("button", { name: "Ajouter un filtre", exact: true })
      .click();
    await selectOption(classes, "IfcWall");
    await expect(
      form.getByRole("button", { name: "Ajouter le filtre", exact: true }),
    ).toBeInViewport();
    await classes.click();
    const popup = page.getByRole("listbox");
    await expect(popup).toBeInViewport();
    const popupBounds = await popup.boundingBox();
    expect(popupBounds!.x).toBeGreaterThanOrEqual(0);
    expect(popupBounds!.x + popupBounds!.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: "/tmp/mnemo-74-rules-mobile.png" });
    await classes.press("Escape");
    await form
      .getByRole("button", { name: "Annuler le filtre", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Ajouter un filtre", exact: true }),
    ).toBeFocused();
    const mobilePanel = await panel.boundingBox();
    const mobileDelete = await rules
      .getByRole("button", { name: /^Supprimer/ })
      .first()
      .boundingBox();
    expect(mobileDelete!.x + mobileDelete!.width).toBeLessThanOrEqual(
      mobilePanel!.x + mobilePanel!.width,
    );
    await panel
      .getByRole("button", { name: "Options d’affichage", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Coloriser par niveau", exact: true })
      .click();
    const palette = rules.getByRole("listitem", {
      name: /^Coloriser par niveau/,
    });
    await expect(palette.getByRole("checkbox")).toBeChecked();
    await palette.getByRole("button", { name: /^Supprimer/ }).click();
    await expect(rules.getByRole("listitem")).toHaveCount(2);
    // External visual resets also remove the corresponding configured rules.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .locator('[aria-label="Modificateurs actifs"]')
      .getByRole("button", { name: /^Retirer/ })
      .click();
    await expect(rules).toHaveCount(0);
    await panel
      .getByRole("button", { name: "Ajouter un filtre", exact: true })
      .click();
    await selectOption(classes, "IfcWall");
    await form
      .getByRole("button", { name: "Ajouter le filtre", exact: true })
      .click();
    await expect(rules.getByRole("listitem")).toHaveCount(1);
    await panel
      .getByRole("button", { name: "Réinitialiser les filtres", exact: true })
      .click();
    await expect(rules).toHaveCount(0);
    expect(
      await canvas.evaluate(
        (node, original) => node === original,
        originalCanvas,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await gotoHydrated(page, href);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Supprimer le projet" }).click();
    await expect(page).toHaveURL(/\/projets$/);
  }
});
