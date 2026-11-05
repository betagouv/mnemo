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
      page.locator('[role="status"]').filter({ hasText: "entités IFC" }),
    ).toBeVisible({ timeout: 120_000 });
    const notifications = page
      .locator('[aria-label="Notifications"]')
      .getByRole("button", { name: "Masquer le message" });
    while (await notifications.count()) await notifications.first().click();
    const tree = page.getByRole("complementary", {
      name: "Explorateur du projet",
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
    let pickedPoint: { x: number; y: number } | null = null;
    for (const y of [0.5, 0.45, 0.55, 0.4, 0.6]) {
      for (const x of [0.5, 0.45, 0.55, 0.4, 0.6]) {
        await page.mouse.click(
          bounds.x + bounds.width * x,
          bounds.y + bounds.height * y,
        );
        const picked = await expect
          .poll(() => selected.count(), {
            timeout: 300,
            intervals: [25, 50, 100],
          })
          .toBe(1)
          .then(
            () => true,
            () => false,
          );
        if (picked) {
          pickedPoint = {
            x: bounds.x + bounds.width * x,
            y: bounds.y + bounds.height * y,
          };
          break;
        }
      }
      if (await selected.count()) break;
    }
    await expect(selected).toHaveCount(1);
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
    await tree.getByRole("tab", { name: "Relevé 3D" }).click();
    if (!pickedPoint) throw new Error("No scene element was picked");
    await page.mouse.click(pickedPoint.x, pickedPoint.y);
    await expect(
      tree.getByRole("tab", { name: "BIM", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
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
    await other.click({ modifiers: ["Control"] });
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
    await third.click({ modifiers: ["Control"] });
    await expect(selectedRows).toHaveCount(3);
    await page.keyboard.down("Control");
    await page.mouse.click(pickedPoint.x, pickedPoint.y);
    await page.keyboard.up("Control");
    // The sample contains overlapping surfaces: whichever surface is hit,
    // Ctrl-click changes membership by one rather than replacing all three.
    await expect
      .poll(async () => [2, 4].includes(await selectedRows.count()))
      .toBe(true);
    await page.mouse.click(pickedPoint.x, pickedPoint.y);
    await expect(selectedRows).toHaveCount(1);
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
  } catch (error) {
    console.error(error);
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
