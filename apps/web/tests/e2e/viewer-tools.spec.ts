import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./hydration";

async function expectFloatingViewerTools(
  page: import("@playwright/test").Page,
) {
  const layout = await page.evaluate(() => {
    const viewer = document.querySelector("main");
    const tools = document.querySelector(
      '[role="group"][aria-label="Outils de la visionneuse"]',
    );
    const viewport = document.querySelector(
      '[aria-label="Visionneuse 3D du projet"]',
    );
    const triggers = Array.from(
      tools?.querySelectorAll(":scope > ul > li > button") ?? [],
    );
    if (!viewer || !tools || !viewport || triggers.length !== 5) return null;
    const viewerRect = viewer.getBoundingClientRect();
    const toolsRect = tools.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const triggerRects = triggers.map((trigger) =>
      trigger.getBoundingClientRect(),
    );
    return {
      sceneUsesFullHeight: Math.abs(viewportRect.top - viewerRect.top) <= 1,
      toolsInsideScene:
        toolsRect.top >= viewportRect.top &&
        toolsRect.left >= viewportRect.left &&
        toolsRect.right <= viewportRect.right &&
        toolsRect.bottom < viewportRect.bottom,
      toolsAtLeft: toolsRect.left - viewportRect.left <= 20,
      triggersStackVertically: triggerRects.every(
        (rect, index) =>
          Math.abs(rect.left - triggerRects[0].left) <= 1 &&
          (index === 0 || rect.top >= triggerRects[index - 1].bottom),
      ),
    };
  });
  expect(layout).toEqual({
    sceneUsesFullHeight: true,
    toolsInsideScene: true,
    toolsAtLeft: true,
    triggersStackVertically: true,
  });
}

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
    await expect(
      page.getByRole("banner").getByRole("img", { name: /^Mnemo/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("banner").getByText(projectName, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: `Scène du projet ${projectName}`,
        level: 1,
        includeHidden: true,
      }),
    ).toBeAttached();
    await expect(
      page.getByRole("link", { name: `Retour au projet ${projectName}` }),
    ).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toBeVisible();
    const footerToggle = page.getByRole("button", {
      name: "Plus d’informations",
    });
    const sceneHeight = await page
      .getByRole("region", { name: "Visionneuse 3D du projet" })
      .evaluate((element) => element.getBoundingClientRect().height);
    await footerToggle.click();
    await expect(
      page.getByRole("button", { name: "Fermer", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("contentinfo")).toContainText("RÉPUBLIQUE");
    expect(
      await page
        .getByRole("region", { name: "Visionneuse 3D du projet" })
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBe(sceneHeight);
    await page.keyboard.press("Escape");
    await expect(footerToggle).toBeFocused();
    await expect(footerToggle).toHaveAttribute("aria-expanded", "false");
    const tools = page.getByRole("group", { name: "Outils de la visionneuse" });
    const sidePanel = page.getByRole("complementary", {
      name: "Coupes",
    });

    await expect(tools.getByRole("button", { name: "Coupes" })).toBeVisible();
    await expect(tools.getByRole("button", { name: "Mesures" })).toBeVisible();
    await expect(
      tools.locator(":scope > ul > li").first().getByRole("button", {
        name: "Tout cadrer",
      }),
    ).toBeVisible();
    await expect(sidePanel).not.toBeVisible();
    await expectFloatingViewerTools(page);

    const measurements = tools.getByRole("button", { name: "Mesures" });
    await measurements.hover();
    await expect(measurements.getByText("Mesures")).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(measurements.getByText("Mesures")).not.toBeVisible();
    await measurements.focus();
    await expect(measurements.getByText("Mesures")).toBeVisible();

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
      sidePanel.getByRole("heading", { name: "Plan de coupe" }),
    ).toBeVisible();
    await expect(sidePanel.locator('input[type="range"]')).toHaveCount(0);
    await expect(
      sidePanel.getByText("Remplir les surfaces coupées"),
    ).toHaveCount(0);
    await sidePanel
      .getByRole("group", { name: "Type de coupe" })
      .getByText("Boîte de coupe")
      .click();
    await expect(
      sidePanel.getByRole("radio", { name: "Boîte de coupe" }),
    ).toBeChecked();
    await expect(
      sidePanel.getByRole("heading", { name: "Boîte de coupe" }),
    ).toBeVisible();
    await expect(sidePanel.locator('input[type="range"]')).toHaveCount(0);

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

    await expect(
      page.getByRole("region", { name: "Propriétés IFC" }),
    ).toBeVisible();
    await tools.getByRole("button", { name: "Annotations" }).click();
    await expect(
      page.getByRole("complementary", { name: "Remarques BCF" }),
    ).toBeVisible();
    await expect(
      tools.getByRole("button", { name: "Annotations" }),
    ).toHaveAttribute("data-active", "true");
    await expect(
      tools.getByRole("button", { name: "Autres outils" }),
    ).not.toHaveAttribute("data-active", "true");

    await page.setViewportSize({ width: 1024, height: 800 });
    await expectFloatingViewerTools(page);
    await expect(
      page.getByRole("complementary", { name: "Remarques BCF" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.setViewportSize({ width: 800, height: 800 });
    await expect(
      page.getByRole("complementary", { name: "Explorateur du projet" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Remarques BCF" }),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expectFloatingViewerTools(page);
    await expect(
      page.getByRole("banner").getByText(projectName, { exact: true }),
    ).toBeVisible();
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
    await tools.getByRole("button", { name: "Coupes" }).click();
    await expect(
      tools.getByRole("button", { name: "Coupe par plan" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await footerToggle.click();
    await expect(
      page.getByRole("button", { name: "Fermer", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("contentinfo")).toContainText("RÉPUBLIQUE");
    await page.keyboard.press("Escape");
    await expect(footerToggle).toHaveAttribute("aria-expanded", "false");
  } finally {
    await gotoHydrated(page, projectHref);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Supprimer le projet" }).click();
    await expect(page).toHaveURL(/\/projets$/);
  }
});
