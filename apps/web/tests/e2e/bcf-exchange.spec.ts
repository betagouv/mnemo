import { decodeBcfArchive, encodeBcfArchive } from "@mnemo/bcf-adapter";
import { expect, test } from "@playwright/test";

test("imports, exports and deduplicates a BCF archive", async ({
  page,
  request,
}) => {
  const projectName = `Projet BCF Playwright ${Date.now()}`;
  await page.goto("/projets");
  await page.getByLabel("Nom du projet").fill(projectName);
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  const projectHref = await page
    .getByRole("link", { name: new RegExp(projectName) })
    .getAttribute("href");
  expect(projectHref).toMatch(/^\/projets\/[0-9a-f-]{36}$/);
  if (!projectHref) throw new Error("The created project has no URL");

  const projectId = projectHref.split("/").at(-1);
  expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
  if (!projectId) throw new Error("The created project has no ID");

  try {
    const topicGuid = crypto.randomUUID();
    const bytes = await encodeBcfArchive({
      projectId,
      projectName,
      topics: [
        {
          guid: topicGuid,
          title: "Collision importée",
          description: "Validation du chemin BCFZIP complet.",
          type: "issue",
          status: "open",
          priority: "high",
          authorName: "coordination@example.fr",
          createdAt: "2026-09-09T10:00:00.000Z",
          updatedAt: "2026-09-09T10:00:00.000Z",
          componentGlobalIds: [],
          comments: [],
          viewpoints: [],
        },
      ],
    });
    const endpoint = `/api/projects/${projectId}/bcf`;

    const imported = await request.post(endpoint, {
      data: Buffer.from(bytes),
      headers: { "content-type": "application/zip" },
    });
    expect(imported.ok()).toBe(true);
    await expect(imported.json()).resolves.toMatchObject({
      imported: { topics: 1 },
      skippedTopics: 0,
    });

    const duplicate = await request.post(endpoint, {
      data: Buffer.from(bytes),
      headers: { "content-type": "application/zip" },
    });
    expect(duplicate.ok()).toBe(true);
    await expect(duplicate.json()).resolves.toMatchObject({
      imported: { topics: 0 },
      skippedTopics: 1,
    });

    const exported = await request.get(endpoint);
    expect(exported.ok()).toBe(true);
    expect(exported.headers()["content-type"]).toBe("application/zip");
    const archive = await decodeBcfArchive(
      new Uint8Array(await exported.body()),
    );
    expect(archive.topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          guid: topicGuid,
          title: "Collision importée",
          authorName: "coordination@example.fr",
        }),
      ]),
    );
  } finally {
    await page.goto(projectHref);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Supprimer le projet" }).click();
    await expect(page).toHaveURL(/\/projets$/);
  }
});
