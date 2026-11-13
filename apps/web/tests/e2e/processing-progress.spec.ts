import { randomUUID } from "node:crypto";
import { createPrismaDatabase } from "@mnemo/database";
import { expect, test } from "./fixtures";
import { gotoHydrated } from "./hydration";

// Future availability keeps the real background worker from claiming this fixture.
test("tracks processing phases, retries and completion without reloading the page", async ({
  page,
  request,
  playwright,
}) => {
  test.setTimeout(120_000);
  const database = createPrismaDatabase({
    connectionString: process.env.DATABASE_URL!,
  });
  const title = `Suivi nuage ${Date.now()}`;
  await gotoHydrated(page, "/projets");
  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await page.getByLabel("Titre du dossier").fill(title);
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  const href = await page
    .getByRole("link", { name: title, exact: true })
    .getAttribute("href");
  if (!href) throw new Error("Missing project URL");
  const projectId = href.split("/").at(-1)!;
  const assetId = randomUUID();
  try {
    const project = await database.db.projects.findUniqueOrThrow({
      where: { id: projectId },
    });
    await database.db.assets.create({
      data: {
        id: assetId,
        project_id: projectId,
        kind: "point_cloud",
        status: "uploaded",
        original_file_name: "Suivi.laz",
        media_type: "application/octet-stream",
        size_bytes: 1000n,
        original_object_key: `test-progress/${assetId}`,
        created_by: project.created_by,
        upload_expires_at: new Date("2035-01-01"),
      },
    });
    const job = await database.db.processing_jobs.create({
      data: {
        asset_id: assetId,
        type: "process_point_cloud",
        available_at: new Date("2035-01-01"),
      },
    });
    await gotoHydrated(page, href);
    const card = page.getByRole("article").filter({ hasText: "Suivi.laz" });
    const processing = card.getByRole("status", {
      name: "Traitement de Suivi.laz",
    });
    await expect(
      card.getByText("En attente de traitement", { exact: true }),
    ).toBeVisible();
    await expect(processing.getByText("Étape 1 sur 5")).toBeVisible();
    const anonymous = await playwright.request.newContext();
    expect(
      (
        await anonymous.get(
          new URL(`/api/projects/${projectId}/assets`, page.url()).href,
        )
      ).status(),
    ).toBe(401);
    await anonymous.dispose();
    expect(
      (await request.get(`/api/projects/${randomUUID()}/assets`)).status(),
    ).toBe(404);
    const feed = await request.get(`/api/projects/${projectId}/assets`);
    expect(feed.status()).toBe(200);
    expect(feed.headers()["cache-control"]).toContain("no-store");
    expect(await feed.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: assetId,
          processingProgress: expect.objectContaining({ phase: "queued" }),
        }),
      ]),
    );
    expect(JSON.stringify(await feed.json())).not.toContain(
      "originalObjectKey",
    );

    async function report(
      phase: "downloading" | "converting" | "publishing",
      percent: number | null,
      updatedAt = new Date().toISOString(),
    ) {
      await database.db.$transaction([
        database.db.assets.update({
          where: { id: assetId },
          data: { status: "processing" },
        }),
        database.db.processing_jobs.update({
          where: { id: job.id },
          data: {
            status: "running",
            locked_at: new Date("2035-01-01"),
            locked_by: "test-progress",
            attempts: 1,
            progress: { phase, percent, updatedAt },
          },
        }),
      ]);
    }
    await report("downloading", 22);
    await expect(card.getByText("22 %", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(processing.getByText("Étape 3 sur 5")).toBeVisible();
    await page.clock.install();
    const lastProgressAt = new Date(Date.now() - 135_000).toISOString();
    await report("converting", 42, lastProgressAt);
    await expect(processing.getByText("42 %", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(processing.getByText("Étape 4 sur 5")).toBeVisible();
    await expect(processing.locator("[data-fr-current-step]")).toHaveAttribute(
      "data-fr-current-step",
      "4",
    );
    const updatedAt = card.locator("time");
    await expect(updatedAt).toHaveAttribute("datetime", lastProgressAt);
    await expect(updatedAt).toHaveText("Mis à jour il y a 2 minutes");
    await expect(updatedAt).toHaveAttribute(
      "title",
      /Dernière progression reçue le .* UTC/,
    );
    await page.clock.fastForward(60_000);
    await expect(updatedAt).toHaveText("Mis à jour il y a 3 minutes");
    await expect(processing.getByText("42 %", { exact: true })).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) =>
          document.documentElement.setAttribute("data-fr-theme", value),
        theme,
      );
      await page.screenshot({
        path: `/tmp/mnemo-processing-progress-${theme}.png`,
        animations: "disabled",
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(processing).toBeInViewport();
    const bounds = await card.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: "/tmp/mnemo-processing-progress-mobile.png",
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await database.db.processing_jobs.update({
      where: { id: job.id },
      data: { status: "queued", progress: undefined },
    });
    await expect(
      card.getByText("En attente de traitement", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(processing.getByText("Étape 1 sur 5")).toBeVisible();
    await expect(processing.getByText("42 %", { exact: true })).toHaveCount(0);
    await report("publishing", null);
    await expect(
      card.getByText("Enregistrement du résultat", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(processing.getByText("Étape 5 sur 5")).toBeVisible();
    await database.db.$transaction([
      database.db.assets.update({
        where: { id: assetId },
        data: { status: "ready" },
      }),
      database.db.processing_jobs.update({
        where: { id: job.id },
        data: { status: "succeeded" },
      }),
    ]);
    await expect(card.getByText("Prêt", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(processing).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Ouvrir la vue", exact: true }),
    ).toBeVisible();
  } finally {
    // The fixture has no S3 object or processor output to delete.
    await database.db.projects.deleteMany({ where: { id: projectId } });
    await database.close();
  }
});
