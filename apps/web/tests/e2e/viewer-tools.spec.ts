import { expect, test } from "./fixtures";
import { gotoHydrated } from "./hydration";

test.use({ viewport: { width: 1440, height: 1000 } });

test("uses contextual panels without empty properties or unavailable tools", async ({
  page,
}) => {
  const name = `Viewer UX ${Date.now()}`;
  await gotoHydrated(page, "/projets");
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await page.getByLabel("Titre du dossier").fill(name);
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  const href = await page
    .getByRole("link", { name, exact: true })
    .getAttribute("href");
  if (!href) throw new Error("Missing project URL");
  try {
    await gotoHydrated(page, `${href}/viewer`);
    const tools = page.getByRole("group", { name: "Outils de la visionneuse" });
    const scene = page.getByRole("region", {
      name: "Visionneuse 3D du projet",
    });
    const canvas = page.locator('canvas[aria-label^="Vue 3D"]');
    const original = await canvas.elementHandle();
    const layers = page.getByRole("complementary", {
      name: "Maquettes et relevés",
    });
    await expect(layers).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Propriétés IFC" }),
    ).toHaveCount(0);
    await expect(
      tools.getByRole("button", { name: "Mesures", exact: true }),
    ).toBeVisible();
    const iconMasks = await tools
      .locator(":scope > ul > li > button")
      .evaluateAll((buttons) =>
        buttons.map((button) => ({
          label: button.getAttribute("aria-label"),
          mask: getComputedStyle(button, "::before").maskImage,
        })),
      );
    expect(iconMasks.filter((icon) => icon.mask === "none")).toEqual([]);
    const initial = await scene.boundingBox();
    await layers.getByRole("button", { name: "Fermer le panneau" }).click();
    const expanded = await scene.boundingBox();
    expect(expanded!.width).toBeGreaterThan(initial!.width);
    const cuts = tools.getByRole("button", { name: "Coupes", exact: true });
    await cuts.focus();
    await cuts.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(cuts.getByText("Coupes", { exact: true })).toBeVisible();
    await cuts.click();
    const panel = page.getByRole("complementary", {
      name: "Coupes",
      exact: true,
    });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("checkbox", { name: "Coupe active" }),
    ).toBeDisabled();
    await expect(
      panel.getByRole("radio", { name: "Plan", exact: true }),
    ).toBeChecked();
    await panel
      .getByRole("group", { name: "Type de coupe" })
      .getByText("Boîte", { exact: true })
      .click();
    await expect(
      panel.getByRole("radio", { name: "Boîte", exact: true }),
    ).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
    await expect(cuts).toBeFocused();
    await tools
      .getByRole("button", { name: "Vues en plan", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Vues en plan", exact: true }),
    ).toBeVisible();
    await tools
      .getByRole("button", { name: "Filtres IFC", exact: true })
      .click();
    await expect(
      page.getByText("Chargez une maquette IFC pour utiliser les filtres."),
    ).toBeVisible();
    await tools.getByRole("button", { name: "Autres outils" }).click();
    await tools
      .getByRole("button", { name: "Informations sur la scène" })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Informations sur la scène" }),
    ).toContainText("Maillages");
    await tools.getByRole("button", { name: "Autres outils" }).click();
    await page.keyboard.press("Escape");
    await expect(
      tools.getByRole("button", { name: "Autres outils" }),
    ).toBeFocused();
    await tools
      .getByRole("button", { name: "Maquettes et relevés", exact: true })
      .click();
    const pin = layers.getByRole("button", { name: "Épingler les maquettes" });
    await expect(pin).toHaveClass(/ri-pushpin-line/);
    const outlineMask = await pin.evaluate(
      (button) => getComputedStyle(button, "::before").maskImage,
    );
    expect(outlineMask).not.toBe("none");
    await pin.click();
    const unpin = layers.getByRole("button", {
      name: "Désépingler les maquettes",
    });
    await expect(unpin).toHaveAttribute("aria-pressed", "true");
    await expect(unpin).toHaveClass(/ri-pushpin-fill/);
    const filledMask = await unpin.evaluate(
      (button) => getComputedStyle(button, "::before").maskImage,
    );
    expect(filledMask).not.toBe("none");
    expect(filledMask).not.toBe(outlineMask);
    await unpin.click();
    await expect(pin).toHaveClass(/ri-pushpin-line/);
    await expect(pin).toHaveAttribute("aria-pressed", "false");
    await pin.click();
    await cuts.click();
    await expect(layers).toBeVisible();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) =>
          document.documentElement.setAttribute("data-fr-theme", value),
        theme,
      );
      await page.screenshot({
        path: test.info().outputPath(`viewer-ux-${theme}.png`),
      });
    }
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(panel).toBeVisible();
    await expect(layers).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await canvas.evaluate((node, prior) => node === prior, original),
    ).toBe(true);
  } finally {
    await gotoHydrated(page, href);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Supprimer le projet" }).click();
    await expect(page).toHaveURL(/\/projets$/);
  }
});
