import { fileURLToPath } from "node:url";

import { expect, test } from "./fixtures";
import { gotoHydrated, waitForHydration } from "./hydration";

const fixture = fileURLToPath(
  new URL("../fixtures/Ifc4_SampleHouse.ifc", import.meta.url),
);

test.use({
  viewport: { width: 1440, height: 1000 },
  screenshot: "only-on-failure",
  // Keep overlay interaction checks independent of the host graphics driver.
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

test("moves box faces and section planes with projected axis arrows", async ({
  page,
}) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(30_000);
  const name = `Boîte de coupe ${Date.now()}`;
  await gotoHydrated(page, "/projets");
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await page.getByLabel("Titre du dossier").fill(name);
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  const href = await page
    .getByRole("link", { name, exact: true })
    .getAttribute("href");
  if (!href) throw new Error("Missing project URL");
  let scenarioFailed = false;
  try {
    await gotoHydrated(page, href);
    await page.locator('input[type="file"]').setInputFiles(fixture);
    await page
      .getByRole("link", { name: "Ouvrir la vue", exact: true })
      .click();
    await expect(
      page.locator('canvas[aria-label^="Vue 3D"][data-phase="ready"]'),
    ).toBeVisible({ timeout: 120_000 });
    const notifications = page
      .locator('[aria-label="Notifications"]')
      .getByRole("button", { name: "Masquer le message" });
    while (await notifications.count()) await notifications.first().click();
    await page.screenshot({
      path: test.info().outputPath("before-section.png"),
    });
    const canvas = page.locator('canvas[aria-label^="Vue 3D"]');
    const originalCanvas = await canvas.elementHandle();
    await page.getByRole("button", { name: "Coupes", exact: true }).click();
    await page
      .getByRole("group", { name: "Type de coupe" })
      .getByText("Boîte", { exact: true })
      .click();

    await page
      .getByRole("button", { name: "Position précise des faces", exact: true })
      .click();
    const handles = page.locator("[data-box-handle]");
    await expect(handles).toHaveCount(6);
    await expect(handles.first()).toBeVisible();
    const colors = await handles.evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).color),
    );
    expect(new Set(colors).size).toBe(3);
    const right = page.getByLabel("Droite (m)", { exact: true });
    const before = Number(await right.inputValue());
    await right.click();
    await right.press("ArrowDown");
    await right.blur();
    await expect
      .poll(async () => Number(await right.inputValue()))
      .toBeCloseTo(before - 0.1, 3);
    const arrow = page.getByRole("button", {
      name: "Déplacer la face droite de la boîte de coupe",
      exact: true,
    });
    const drag = await arrow.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        dx: matrix.a * 25,
        dy: matrix.b * 25,
      };
    });
    const beforeDrag = Number(await right.inputValue());
    await page.mouse.move(drag.x, drag.y);
    await page.mouse.down();
    await page.mouse.move(drag.x + drag.dx, drag.y + drag.dy, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => Number(await right.inputValue()))
      .not.toBe(beforeDrag);
    expect(
      await canvas.evaluate(
        (element, original) => element === original,
        originalCanvas,
      ),
    ).toBe(true);
    const originalTransform = await arrow.evaluate(
      (element) => element.style.transform,
    );
    const viewport = await canvas.boundingBox();
    if (!viewport) throw new Error("Missing viewport");
    await page.mouse.move(viewport.x + 120, viewport.y + 150);
    await page.mouse.down();
    await page.mouse.move(viewport.x + 160, viewport.y + 170, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() => arrow.evaluate((element) => element.style.transform))
      .not.toBe(originalTransform);
    await page.screenshot({
      path: test.info().outputPath("section-box-light.png"),
    });
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-fr-theme", "dark"),
    );
    await expect
      .poll(() => arrow.evaluate((element) => getComputedStyle(element).color))
      .toBe("rgb(255, 116, 124)");
    await expect(arrow).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.screenshot({
      path: test.info().outputPath("section-box-dark.png"),
    });
    await page
      .getByRole("group", { name: "Type de coupe" })
      .getByText("Plan", { exact: true })
      .click();
    await expect(handles).toHaveCount(0);
    const planeArrow = page.getByRole("button", {
      name: "Déplacer le plan de coupe",
      exact: true,
    });
    await expect(
      page.getByText("Cliquez sur une face de la maquette."),
    ).toBeVisible();
    await canvas.click();
    await expect(planeArrow).toBeVisible();
    const planeArrowPosition = () =>
      planeArrow.evaluate((element) =>
        [element.style.left, element.style.top].join(","),
      );
    const initialArrowPosition = await planeArrowPosition();
    await planeArrow.press("ArrowUp");
    await expect.poll(planeArrowPosition).not.toBe(initialArrowPosition);
    const planeDrag = await planeArrow.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        dx: matrix.a * 15,
        dy: matrix.b * 15,
      };
    });
    const beforePlaneDrag = await planeArrowPosition();
    await page.mouse.move(planeDrag.x, planeDrag.y);
    await page.mouse.down();
    await page.mouse.move(
      planeDrag.x + planeDrag.dx,
      planeDrag.y + planeDrag.dy,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect.poll(planeArrowPosition).not.toBe(beforePlaneDrag);
    await page.screenshot({
      path: test.info().outputPath("section-plane-dark.png"),
    });
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-fr-theme", "light"),
    );
    await expect(planeArrow).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("section-plane-light.png"),
    });
    expect(
      await canvas.evaluate(
        (element, original) => element === original,
        originalCanvas,
      ),
    ).toBe(true);
  } catch (error) {
    scenarioFailed = true;
    console.error(error);
    await page
      .screenshot({
        path: test.info().outputPath("failure-before-cleanup.png"),
      })
      .catch((screenshotError: unknown) => console.error(screenshotError));
    throw error;
  } finally {
    try {
      // Dispose the WebGPU page before navigating to the project for cleanup.
      await page.close();
      const cleanup = await page.context().newPage();
      cleanup.setDefaultTimeout(15_000);
      cleanup.setDefaultNavigationTimeout(30_000);
      try {
        await cleanup.goto(href, { waitUntil: "domcontentloaded" });
        await waitForHydration(cleanup);
        cleanup.once("dialog", (dialog) => void dialog.accept());
        await cleanup
          .getByRole("button", { name: "Modifier le dossier" })
          .click();
        await cleanup
          .getByRole("button", { name: "Supprimer le dossier" })
          .click();
        await expect(cleanup).toHaveURL(/\/projets$/);
      } finally {
        await cleanup.close();
      }
    } catch (cleanupError) {
      if (!scenarioFailed) throw cleanupError;
      console.error(
        "Project cleanup failed after the scenario error",
        cleanupError,
      );
    }
  }
});
