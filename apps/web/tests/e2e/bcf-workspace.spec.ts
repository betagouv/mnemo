import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { decodeBcfArchive } from "@mnemo/bcf-adapter";
import { expect, test } from "./fixtures";
import { gotoHydrated } from "./hydration";
const fixture = fileURLToPath(
  new URL("../fixtures/Ifc4_SampleHouse.ifc", import.meta.url),
);
// Keep screenshot/readback assertions independent of the host Vulkan driver.
test.use({
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
test.setTimeout(300_000);
test("creates a multi-object remark with a preview, comments, restores and exports its view", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(60_000);
  page.on("dialog", (dialog) => void dialog.accept());
  const title = `BCF workspace ${Date.now()}`;
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
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator('input[type="file"]').click(),
    ]);
    await chooser.setFiles(fixture);
    await page
      .getByRole("link", { name: "Ouvrir la vue", exact: true })
      .click();
    await expect(
      page.locator('canvas[aria-label^="Vue 3D"][data-phase="ready"]'),
    ).toBeVisible({ timeout: 120000 });
    const notifications = page
      .locator('[aria-label="Notifications"]')
      .getByRole("button", { name: "Masquer le message" });
    while (await notifications.count()) await notifications.first().click();
    await page
      .getByRole("button", { name: "Remarques BCF", exact: true })
      .click();
    const panel = page.getByRole("complementary", { name: "Remarques BCF" });
    await panel.getByRole("button", { name: "Nouvelle remarque" }).click();
    await expect(
      panel.getByRole("button", { name: "Créer la remarque", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: test.info().outputPath("bcf-editor-light.png"),
    });
    await panel.getByLabel("Titre", { exact: true }).fill("Vérifier les murs");
    await panel
      .getByLabel("Description", { exact: true })
      .fill("Contrôle avant livraison");
    await panel.getByText("Des objets de la maquette", { exact: true }).click();
    await panel.getByLabel("Filtrer les objets à ajouter").fill("IfcWall");
    await panel
      .getByRole("button", { name: "Ajouter les résultats du filtre" })
      .click();
    await panel
      .getByRole("button", { name: "Capturer la vue actuelle" })
      .click();
    await expect(
      panel.getByAltText("Aperçu de la vue qui sera enregistrée"),
    ).toBeVisible();
    await panel.getByLabel("Échéance").fill("2026-12-15");
    await panel
      .getByRole("button", { name: "Créer la remarque", exact: true })
      .click();
    await expect(
      panel.getByRole("heading", { name: "Vérifier les murs", exact: true }),
    ).toBeVisible();
    await expect(panel.getByText("Actif", { exact: true })).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Paramètres des remarques" }),
    ).toHaveCount(0);
    await panel
      .getByRole("tab", { name: "Discussion (0)", exact: true })
      .click();
    await panel
      .getByLabel("Votre commentaire")
      .fill("À reprendre avec le bureau d’études.");
    await panel.getByRole("button", { name: "Publier le commentaire" }).click();
    await expect(
      panel.getByText("À reprendre avec le bureau d’études.", { exact: true }),
    ).toBeVisible();
    await panel.getByRole("tab", { name: "Vues (1)", exact: true }).click();
    const image = panel.getByAltText("Capture de la vue 1", { exact: true });
    await expect(image).toHaveAttribute("crossorigin", "anonymous");
    await expect(image).toBeInViewport();
    await expect
      .poll(() =>
        image.evaluate((element) => {
          const img = element as HTMLImageElement;
          return img.complete && img.naturalWidth > 0;
        }),
      )
      .toBe(true);
    const src = await image.getAttribute("src");
    expect(new URL(src!, page.url()).pathname).toMatch(/^\/api\/projects\//);
    expect(new URL(src!, page.url()).origin).toBe(new URL(page.url()).origin);
    const redirect = await request.get(src!, { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(redirect.headers()["cache-control"]).toContain("no-store");
    await panel
      .getByRole("button", { name: "Afficher cette vue", exact: true })
      .click();
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await panel.getByRole("button", { name: "Toutes les remarques" }).click();
    await panel
      .getByText("Afficher les repères dans la scène", { exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: /Remarque \d+ : Vérifier les murs/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Remarque \d+ : Vérifier les murs/ })
      .click();
    await expect(
      panel.getByRole("heading", { name: "Vérifier les murs", exact: true }),
    ).toBeVisible();
    const response = await request.get(
      `/api/projects/${href.split("/").at(-1)}/bcf`,
    );
    expect(response.ok()).toBe(true);
    const archive = await decodeBcfArchive(
      new Uint8Array(await response.body()),
    );
    expect(archive.topics[0]).toMatchObject({
      title: "Vérifier les murs",
      status: "Open",
      dueDate: "2026-12-15",
      comments: [{ comment: "À reprendre avec le bureau d’études." }],
    });
    expect(archive.topics[0]?.componentGlobalIds.length).toBeGreaterThan(1);
    expect(
      archive.topics[0]?.viewpoints[0]?.snapshot?.bytes.byteLength,
    ).toBeGreaterThan(100);
    const snapshot = Buffer.from(
      archive.topics[0]!.viewpoints[0]!.snapshot!.bytes,
    );
    const camera = archive.topics[0]!.viewpoints[0]!.data.perspectiveCamera;
    expect(snapshot.readUInt32BE(16) / snapshot.readUInt32BE(20)).toBeCloseTo(
      camera!.aspectRatio!,
      2,
    );
    await writeFile(
      test.info().outputPath("bcf-snapshot.png"),
      archive.topics[0]!.viewpoints[0]!.snapshot!.bytes,
    );
    await panel
      .getByRole("tab", { name: "Discussion (1)", exact: true })
      .click();
    const discussion = panel.getByRole("region", {
      name: "Discussion",
      exact: true,
    });
    await expect(discussion.getByRole("article")).toBeInViewport();
    await expect(discussion.getByLabel("Votre commentaire")).toBeInViewport();
    const comment = await discussion.getByRole("article").boundingBox();
    const composer = await discussion
      .getByLabel("Votre commentaire")
      .boundingBox();
    expect(
      comment && composer && composer.y >= comment.y + comment.height,
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("bcf-workspace-light.png"),
    });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-fr-scheme", "dark");
      document.documentElement.setAttribute("data-fr-theme", "dark");
    });
    await page.screenshot({
      path: test.info().outputPath("bcf-workspace-dark.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("bcf-mobile-dark.png"),
    });
  } finally {
    await gotoHydrated(page, href);
    await page.getByRole("button", { name: "Modifier le dossier" }).click();
    await page.getByRole("button", { name: "Supprimer le dossier" }).click();
  }
});
