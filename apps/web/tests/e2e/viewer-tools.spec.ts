import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./hydration";

async function expectSingleViewerToolbarRow(
  page: import("@playwright/test").Page,
) {
  const layout = await page.evaluate(() => {
    const header = document.querySelector("main > header");
    const tools = document.querySelector(
      '[role="group"][aria-label="Outils de la visionneuse"]',
    );
    const viewport = document.querySelector(
      '[aria-label="Visionneuse 3D du projet"]',
    );
    const triggers = Array.from(
      tools?.querySelectorAll(":scope > ul > li > button") ?? [],
    );
    if (!header || !tools || !viewport || triggers.length !== 7) return null;
    const headerRect = header.getBoundingClientRect();
    const toolsRect = tools.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const triggerRects = triggers.map((trigger) =>
      trigger.getBoundingClientRect(),
    );
    return {
      aligned:
        Math.abs(headerRect.top - toolsRect.top) <= 1 &&
        Math.abs(headerRect.bottom - toolsRect.bottom) <= 1,
      sceneStartsBelowBar: Math.abs(viewportRect.top - toolsRect.bottom) <= 1,
      triggersShareRow: triggerRects.every(
        (rect) => Math.abs(rect.top - triggerRects[0].top) <= 1,
      ),
      triggersStayInBar: triggerRects.every(
        (rect) => rect.right <= toolsRect.right + 1,
      ),
    };
  });
  expect(layout).toEqual({
    aligned: true,
    sceneStartsBelowBar: true,
    triggersShareRow: true,
    triggersStayInBar: true,
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
    const tools = page.getByRole("group", { name: "Outils de la visionneuse" });
    const sidePanel = page.getByRole("complementary", {
      name: "Coupes",
    });

    await expect(tools.getByRole("button", { name: "Coupes" })).toBeVisible();
    await expect(sidePanel).not.toBeVisible();
    await expectSingleViewerToolbarRow(page);

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
    await expect(sidePanel.getByText("Remplir les surfaces coupées")).toHaveCount(0);
    await sidePanel.getByRole("button", { name: "Boîte de coupe" }).click();
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

    await tools.getByRole("button", { name: "Données" }).click();
    await tools.getByRole("button", { name: "Propriétés IFC" }).click();
    await expect(
      page.getByRole("complementary", { name: "Propriétés IFC" }),
    ).toBeVisible();
    await tools.getByRole("button", { name: "Annotations" }).click();
    await expect(
      page.getByRole("complementary", { name: "Remarques BCF" }),
    ).toBeVisible();
    await expect(
      tools.getByRole("button", { name: "Annotations" }),
    ).toHaveAttribute("data-active", "true");
    await expect(
      tools.getByRole("button", { name: "Exporter" }),
    ).not.toHaveAttribute("data-active", "true");

    await page.setViewportSize({ width: 1024, height: 800 });
    await expectSingleViewerToolbarRow(page);
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
    await expectSingleViewerToolbarRow(page);
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
  } finally {
    await gotoHydrated(page, projectHref);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Supprimer le projet" }).click();
    await expect(page).toHaveURL(/\/projets$/);
  }
});
