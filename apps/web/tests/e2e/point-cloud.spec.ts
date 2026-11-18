import { fileURLToPath } from "node:url";

import { pointCloudSourceSchema } from "@mnemo/contracts/point-clouds";
import { expect, test } from "./fixtures";

import { gotoHydrated, waitForHydration } from "./hydration";

const sampleCopcPath = fileURLToPath(
  new URL("../fixtures/tiny.copc.laz", import.meta.url),
);

test("uploads, processes and range-loads the versioned COPC fixture", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const projectName = `Nuage Playwright ${Date.now()}`;

  await gotoHydrated(page, "/projets");
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await page.getByLabel("Titre du dossier").fill(projectName);
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  const projectHref = await page
    .getByRole("link", { name: new RegExp(projectName) })
    .getAttribute("href");
  expect(projectHref).toMatch(/^\/projets\/[0-9a-f-]{36}$/);
  if (!projectHref) throw new Error("The created project has no URL");

  try {
    await page.getByRole("link", { name: new RegExp(projectName) }).click();
    const projectId = projectHref.split("/").at(-1);
    await page
      .locator('input[type="file"][accept*=".laz"]')
      .setInputFiles(sampleCopcPath);

    const card = page.getByRole("article").filter({ hasText: "tiny.copc.laz" });
    await expect(card).toBeVisible();
    const assetId = await card.getAttribute("data-asset-id");
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
    expect(assetId).toMatch(/^[0-9a-f-]{36}$/);

    const sourceUrl = `/api/projects/${projectId}/assets/${assetId}/point-cloud/source`;
    await expect
      .poll(
        async () =>
          (await request.get(sourceUrl, { timeout: 10_000 })).status(),
        { timeout: 120_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toBe(200);

    await page.reload();
    await waitForHydration(page);
    await expect(card).toContainText(/prêt/i);

    const sourceResponse = await request.get(sourceUrl);
    expect(sourceResponse.ok()).toBe(true);
    const source = pointCloudSourceSchema.parse(await sourceResponse.json());
    expect(source).toMatchObject({ mode: "copc", pointCount: 1_800 });
    if (source.mode !== "copc") throw new Error("Expected a COPC source");

    // Exercise the signed S3 URL from the browser, including CORS and Range.
    const probe = await page.evaluate(async (url) => {
      const response = await fetch(url, {
        headers: { Range: "bytes=0-374" },
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        status: response.status,
        length: bytes.length,
        signature: String.fromCharCode(...bytes.slice(0, 4)),
      };
    }, source.copcUrl);
    expect(probe).toEqual({ status: 206, length: 375, signature: "LASF" });

    await page.getByRole("link", { name: "Ouvrir la vue" }).click();
    await expect(page).toHaveURL(/\/projets\/[0-9a-f-]+\/viewer$/);
    await expect(
      page.locator('[aria-label="Visionneuse 3D du projet"]'),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Maquettes et relevés", exact: true })
      .click();
    await expect(page.getByRole("tab", { name: /^Relevés/ })).toBeVisible();

    // Software WebGPU is unreliable in hosted CI; local headed runs validate
    // actual rendering and budget changes, as for the IFC fixture.
    if (process.env.CI) return;

    await page.getByRole("tab", { name: /^Relevés/ }).click();
    await expect(page.getByText(/1\s*800 pts/)).toBeVisible({
      timeout: 120_000,
    });
    await page
      .getByRole("button", {
        name: "Qualité de rendu des relevés",
        exact: true,
      })
      .click();
    await page.getByLabel("Budget de points").fill("500000");
    await page.getByRole("button", { name: "Appliquer le budget" }).click();
    await expect(page.getByText(/1\s*800 pts/)).toBeVisible();
  } finally {
    await gotoHydrated(page, projectHref);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Modifier le dossier" }).click();
    await page.getByRole("button", { name: "Supprimer le dossier" }).click();
    await expect(page).toHaveURL(/\/projets$/);
  }
});
