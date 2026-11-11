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

test("measures 3D geometry with snapping, drafts and session results", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const title = `Mesures ${Date.now()}`;
  await gotoHydrated(page, "/projets");
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await page.getByLabel("Titre du dossier").fill(title);
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  const href = await page
    .getByRole("link", { name: title, exact: true })
    .getAttribute("href");
  if (!href) throw new Error("Project URL missing");
  try {
    await gotoHydrated(page, href);
    await page.locator('input[type="file"]').setInputFiles(fixture);
    await page
      .getByRole("link", { name: "Ouvrir la vue", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "entités IFC" }),
    ).toBeVisible({ timeout: 120_000 });
    await page
      .getByRole("button", { name: "Vue de dessus", exact: true })
      .dispatchEvent("click");
    await page
      .getByRole("group", { name: "Type de projection" })
      .getByText("Ortho", { exact: true })
      .click();
    await expect(
      page.getByRole("radio", { name: "Projection orthographique" }),
    ).toBeChecked();
    const tools = page.getByRole("group", { name: "Outils de la visionneuse" });
    await tools.getByRole("button", { name: "Mesures", exact: true }).click();
    await tools.getByRole("button", { name: "Distance", exact: true }).click();
    let panel = page.getByRole("complementary", { name: "Mesure de distance" });
    await expect(panel.getByText("Choisissez le premier point.")).toBeVisible();
    const canvas = page.locator('canvas[aria-label^="Vue 3D"]');
    const originalCanvas = await canvas.elementHandle();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Canvas bounds missing");
    let snapped = false;
    for (const y of Array.from(
      { length: 31 },
      (_, index) => 0.2 + index * 0.02,
    )) {
      for (const x of Array.from(
        { length: 31 },
        (_, index) => 0.2 + index * 0.02,
      )) {
        await page.mouse.move(
          bounds.x + bounds.width * x,
          bounds.y + bounds.height * y,
        );
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            ),
        );
        if (
          await page
            .locator("svg text")
            .filter({ hasText: /^(Sommet|Arête)$/ })
            .isVisible()
        ) {
          snapped = true;
          break;
        }
      }
      if (snapped) break;
    }
    expect(snapped).toBe(true);
    const points = [
      { x: bounds.width * 0.44, y: bounds.height * 0.45 },
      { x: bounds.width * 0.49, y: bounds.height * 0.45 },
      { x: bounds.width * 0.44, y: bounds.height * 0.5 },
    ];
    await canvas.click({ position: points[0] });
    await expect(panel.getByText("Choisissez le second point.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel.getByText("Choisissez le premier point.")).toBeVisible();
    await canvas.click({ position: points[0] });
    await canvas.click({ position: points[1] });
    await expect(
      panel.getByRole("heading", { name: "Mesures de la session (1)" }),
    ).toBeVisible();
    await expect(panel.locator("li strong")).toContainText(/\d.* m$/);
    const anchor = await page
      .locator("svg g")
      .filter({ hasText: /1 ·/ })
      .locator("circle")
      .first()
      .evaluate((element) => ({
        x: Number(element.getAttribute("cx")),
        y: Number(element.getAttribute("cy")),
      }));
    await page.mouse.move(bounds.x + anchor.x + 4, bounds.y + anchor.y + 4);
    await expect(
      page.locator("svg text").filter({ hasText: "Point de mesure" }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Fermer le panneau" }).click();
    await tools.getByRole("button", { name: "Mesures", exact: true }).click();
    await tools.getByRole("button", { name: "Surface", exact: true }).click();
    panel = page.getByRole("complementary", { name: "Mesure de surface" });
    await expect(
      panel.getByRole("heading", { name: "Mesures de la session (1)" }),
    ).toBeVisible();
    await panel.getByText("Accrochage et alignements", { exact: true }).click();
    await expect(
      panel.getByRole("checkbox", {
        name: "Accrochage et alignements",
      }),
    ).not.toBeChecked();
    for (const point of points) await canvas.click({ position: point });
    await expect(
      panel.getByRole("button", { name: "Terminer la surface" }),
    ).toBeEnabled();
    await page.keyboard.press("Backspace");
    await expect(
      panel.getByRole("button", { name: "Terminer la surface" }),
    ).toBeDisabled();
    await canvas.click({ position: points[2] });
    await page.keyboard.press("Enter");
    await expect(
      panel.getByRole("heading", { name: "Mesures de la session (2)" }),
    ).toBeVisible();
    await expect(panel.locator("li strong").last()).toContainText(/\d.* m²$/);
    const values = await panel.locator("li strong").allTextContents();
    await page.mouse.move(
      bounds.x + bounds.width * 0.5,
      bounds.y + bounds.height * 0.5,
    );
    await page.mouse.wheel(0, -120);
    await expect(panel.locator("li strong")).toHaveText(values);
    await expect
      .poll(() =>
        canvas.evaluate(
          (element, original) => element === original,
          originalCanvas,
        ),
      )
      .toBe(true);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) =>
          document.documentElement.setAttribute("data-fr-scheme", value),
        theme,
      );
      await expect(page.locator("html")).toHaveAttribute(
        "data-fr-theme",
        theme,
      );
      await page.screenshot({
        path: `/tmp/mnemo-measurements-${theme}.png`,
        animations: "disabled",
      });
    }
    await panel.getByRole("button", { name: "Effacer les mesures" }).click();
    await expect(
      panel.getByRole("heading", { name: "Mesures de la session (0)" }),
    ).toBeVisible();
  } catch (error) {
    await page
      .screenshot({ path: "/tmp/mnemo-measurements-failure.png" })
      .catch(() => undefined);
    throw error;
  } finally {
    await page.close();
    const cleanup = await page.context().newPage();
    try {
      await gotoHydrated(cleanup, href);
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
