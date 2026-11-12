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
  const browserErrors: string[] = [];
  page.on("pageerror", (error) =>
    browserErrors.push(error.stack ?? error.message),
  );
  let workerCount = 0;
  page.on("worker", () => {
    workerCount++;
  });
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
    page.locator('canvas[aria-label^="Vue 3D"][data-phase="ready"]'),
  ).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Vues en plan", exact: true }).click();
  const settings = page.getByRole("complementary", {
    name: "Vues en plan",
    exact: true,
  });
  await settings
    .getByRole("combobox", { name: "Niveau", exact: true })
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
  await expect
    .poll(() =>
      canvas.evaluate(
        (element) =>
          (element as HTMLCanvasElement)
            .getContext("2d")!
            .getImageData(0, 0, 1, 1).data[3],
      ),
    )
    .toBe(255);
  // Scope runtime-error assertions to plan navigation, after project setup.
  browserErrors.length = 0;
  // Count actual vector strokes, excluding the independent measurement overlay.
  await page.evaluate(() => {
    const state = { strokes: 0 };
    (
      window as typeof window & { planRasterTest: typeof state }
    ).planRasterTest = state;
    const stroke = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (path?: Path2D) {
      if (path) {
        if (this.canvas.getAttribute("aria-hidden") !== "true") state.strokes++;
        stroke.call(this, path);
      } else Reflect.apply(stroke, this, []);
    };
  });
  const vectorStrokes = () =>
    page.evaluate(
      () =>
        (window as typeof window & { planRasterTest: { strokes: number } })
          .planRasterTest.strokes,
    );
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing plan canvas bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 80,
    box.y + box.height / 2 + 40,
    { steps: 8 },
  );
  expect(await vectorStrokes()).toBe(0);
  await page.mouse.up();
  await expect.poll(vectorStrokes).toBeGreaterThan(0);
  const wheelPreview = await canvas.evaluate(async (element) => {
    const state = (
      window as typeof window & { planRasterTest: { strokes: number } }
    ).planRasterTest;
    const before = state.strokes;
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: -120,
        clientX: rect.x + rect.width / 2,
        clientY: rect.y + rect.height / 2,
      }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return { before, after: state.strokes };
  });
  expect(wheelPreview.after).toBe(wheelPreview.before);
  await expect.poll(vectorStrokes).toBeGreaterThan(wheelPreview.after);
  // A second settled zoom must reuse a live detail buffer.
  const beforeSecondZoom = await vectorStrokes();
  await page.mouse.wheel(0, -120);
  await expect.poll(vectorStrokes).toBeGreaterThan(beforeSecondZoom);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  expect(browserErrors).toEqual([]);
  await plan.dblclick();
  await page.getByRole("button", { name: "Mesurer", exact: true }).click();
  // Measurement help can resize the canvas. Read targets from the active layout.
  const findInk = () =>
    canvas.evaluate((element) => {
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
  // A plan click must reveal the same IFC entity in the explorer and inspector.
  await page.getByRole("button", { name: "Mesurer", exact: true }).click();
  const selectionInk = await findInk();
  expect(selectionInk.length).toBeGreaterThan(0);
  const selectedTree = page.locator(
    'button[aria-current="true"][aria-pressed="true"]',
  );
  await page.mouse.click(selectionInk[0].x, selectionInk[0].y);
  await expect(selectedTree).toHaveCount(1);
  await page
    .getByRole("button", { name: "Afficher dans l’arborescence", exact: true })
    .click();
  await expect(selectedTree).toBeInViewport();
  await page.getByRole("button", { name: "Vues en plan", exact: true }).click();
  const selectedTitle = await selectedTree.getAttribute("title");
  await expect(
    page.getByRole("button", { name: "Effacer la sélection", exact: true }),
  ).toBeVisible();
  const selectionOverlay = plan.locator('canvas[aria-hidden="true"]');
  await expect
    .poll(() =>
      selectionOverlay.evaluate((element) => {
        const target = element as HTMLCanvasElement;
        return target
          .getContext("2d")!
          .getImageData(0, 0, target.width, target.height)
          .data.some((value, index) => index % 4 === 3 && value > 0);
      }),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/mnemo-plan-selection-light.png",
    animations: "disabled",
  });
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-fr-theme", "dark"),
  );
  await page.screenshot({
    path: "/tmp/mnemo-plan-selection-dark.png",
    animations: "disabled",
  });
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-fr-theme", "light"),
  );
  // Moving the plan must preserve the selection and use the cached raster.
  await page.mouse.move(selectionInk[0].x, selectionInk[0].y);
  await page.mouse.down();
  await page.mouse.move(selectionInk[0].x + 30, selectionInk[0].y + 20, {
    steps: 4,
  });
  await page.mouse.up();
  await expect(selectedTree).toHaveAttribute("title", selectedTitle!);
  await page
    .getByRole("button", { name: "Effacer la sélection", exact: true })
    .click();
  await expect(selectedTree).toHaveCount(0);
  await plan.dblclick();
  await page.getByRole("button", { name: "Mesurer", exact: true }).click();
  let ink: { x: number; y: number }[] = [];
  await expect
    .poll(async () => {
      ink = await findInk();
      if (ink.length !== 2) return false;
      await page.mouse.move(ink[0].x + 2, ink[0].y + 2);
      return page.getByText(/^(Sommet|Segment) accroché$/).isVisible();
    })
    .toBe(true);
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
    .fill("Murs terre cuite");
  await settings
    .getByRole("combobox", { name: "Classe IFC", exact: true })
    .selectOption("IfcWall");
  const fillPalette = settings.getByRole("group", {
    name: "Couleurs du plan",
    exact: true,
  });
  const fillTrigger = fillPalette.getByRole("button", {
    name: /^Remplissage,/,
  });
  await fillTrigger.click();
  const strokesBeforeColors = await vectorStrokes();
  for (const color of ["#7b9eac", "#7d9b87", "#b87560"]) {
    await fillPalette
      .getByRole("button", { name: `Choisir ${color}`, exact: true })
      .click();
    if (color !== "#b87560") await fillTrigger.click();
  }
  expect(await vectorStrokes()).toBe(strokesBeforeColors);
  await expect.poll(vectorStrokes).toBeGreaterThan(strokesBeforeColors);
  const contourPalette = settings.getByRole("group", {
    name: "Couleurs du plan",
    exact: true,
  });
  await contourPalette.getByRole("button", { name: /^Contour,/ }).click();
  await contourPalette.screenshot({ path: "/tmp/mnemo-palette-compact.png" });
  await contourPalette
    .getByRole("button", { name: "Autre couleur", exact: true })
    .click();
  const strokesBeforeDraft = await vectorStrokes();
  await contourPalette
    .getByLabel("Nouvelle couleur pour contour", { exact: true })
    .fill("#123456");
  await contourPalette
    .getByRole("textbox", { name: /^Code hexadécimal/ })
    .fill("#345678");
  expect(await vectorStrokes()).toBe(strokesBeforeDraft);
  const colorLayout = await contourPalette.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(colorLayout.height).toBeLessThan(180);
  expect(colorLayout.scrollWidth).toBeLessThanOrEqual(colorLayout.width);
  await contourPalette.screenshot({ path: "/tmp/mnemo-palette-light.png" });
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-fr-theme", "dark"),
  );
  await contourPalette.screenshot({ path: "/tmp/mnemo-palette-dark.png" });
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-fr-theme", "light"),
  );
  await contourPalette
    .getByRole("button", { name: "Ajouter", exact: true })
    .click();
  await expect(
    contourPalette.getByRole("button", {
      name: "Contour, #345678",
      exact: true,
    }),
  ).toBeVisible();
  await fillTrigger.click();
  await expect(
    fillPalette.getByRole("button", { name: "Choisir #345678", exact: true }),
  ).toBeVisible();
  await fillTrigger.press("Escape");
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
    .fill("RDC terre cuite");
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
    page.locator('canvas[aria-label^="Vue 3D"][data-phase="ready"]'),
  ).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Vues en plan", exact: true }).click();
  await settings
    .getByRole("combobox", { name: "Vue enregistrée", exact: true })
    .selectOption({ label: "RDC terre cuite" });
  await expect(plan).toBeVisible({ timeout: 60_000 });
  await settings
    .getByRole("button", { name: "Règles personnalisées (1)", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Murs terre cuite", exact: true })
    .click();
  await expect(
    settings.getByRole("button", { name: "Remplissage, #b87560", exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByLabel("Épaisseur du trait", { exact: true }),
  ).toHaveValue("0.7");
  await settings
    .getByRole("button", { name: "Règles personnalisées (1)", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 760 });
  await expect(
    settings.getByRole("combobox", { name: "Niveau", exact: true }),
  ).toBeInViewport();
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
  const sceneCanvas = await page
    .locator('canvas[aria-label^="Vue 3D"]')
    .elementHandle();
  const savedViewSelect = settings.getByRole("combobox", {
    name: "Vue enregistrée",
    exact: true,
  });
  const savedId = await savedViewSelect.inputValue();
  const beforeNewLevel = workerCount;
  await settings
    .getByRole("combobox", { name: "Niveau", exact: true })
    .selectOption({ label: "Roof" });
  await expect(
    page.getByRole("group", {
      name: "Plan interactif du niveau Roof",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60_000 });
  expect(workerCount).toBe(beforeNewLevel + 1);
  await expect(savedViewSelect).toHaveValue(savedId);
  await expect(
    settings
      .getByRole("status")
      .filter({ hasText: "Modifications non enregistrées" }),
  ).toBeVisible();
  await settings
    .getByRole("combobox", { name: "Niveau", exact: true })
    .selectOption({ label: "Ground Floor" });
  await expect(plan).toBeVisible({ timeout: 60_000 });
  expect(workerCount).toBe(beforeNewLevel + 1);
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
  expect(await sceneCanvas!.evaluate((element) => element.isConnected)).toBe(
    true,
  );
  // Exercise the worker-error path with a fresh controller and no drawing cache.
  await page.addInitScript(() => {
    const postMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message: unknown,
      ...args: unknown[]
    ) {
      if (
        message &&
        typeof message === "object" &&
        "meshes" in message &&
        "elevation" in message
      ) {
        queueMicrotask(() =>
          this.dispatchEvent(
            new MessageEvent("message", {
              data: {
                error:
                  "Le maillage IFC #123 dépasse la limite de 50 000 triangles projetés par maillage d'IFC-Lite. La génération du plan a été interrompue pour éviter un résultat incomplet.",
              },
            }),
          ),
        );
      } else Reflect.apply(postMessage, this, [message, ...args]);
    };
  });
  await gotoHydrated(page, `${href}/viewer`);
  await expect(
    page.locator('canvas[aria-label^="Vue 3D"][data-phase="ready"]'),
  ).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Vues en plan", exact: true }).click();
  await settings
    .getByRole("combobox", { name: "Niveau", exact: true })
    .selectOption({ label: "Ground Floor" });
  await expect(
    settings.getByRole("heading", { name: "Plan non généré", exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByText(/Niveau « Ground Floor ».*IFC #123.*50 000/),
  ).toBeVisible();
  await expect(plan).toHaveCount(0);
  await expect(
    settings.getByRole("button", {
      name: "Enregistrer cette vue",
      exact: true,
    }),
  ).toHaveCount(0);
});
