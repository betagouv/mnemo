import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { createPrismaDatabase } from "@mnemo/database";
import { gotoHydrated } from "./hydration";

const adminId = randomUUID();
const pendingId = randomUUID();
const ordinaryId = randomUUID();
const password = `Local-test-password-${randomUUID()}`;
const email = (id: string) => `admin-e2e-${id}@example.invalid`;
let database: ReturnType<typeof createPrismaDatabase>;

test.beforeAll(async () => {
  database = createPrismaDatabase({
    connectionString: process.env.DATABASE_URL!,
  });
  for (const [id, name, approved, admin] of [
    [adminId, "Admin navigateur", true, true],
    [pendingId, "Demande navigateur", false, false],
    [ordinaryId, "Utilisateur navigateur", true, false],
  ] as const) {
    await database.db.users.create({
      data: {
        id,
        email: email(id),
        display_name: name,
        email_verified: true,
        approved_at: approved ? new Date() : null,
        roles: admin ? ["user", "admin"] : ["user"],
        auth_accounts: {
          create: {
            id: randomUUID(),
            account_id: id,
            provider_id: "credential",
            password: await hashPassword(password),
          },
        },
      },
    });
  }
});
test.afterAll(async () => {
  if (!database) return;
  await database.db.users.deleteMany({
    where: { id: { in: [adminId, pendingId, ordinaryId] } },
  });
  await database.close();
});

async function login(page: import("@playwright/test").Page, id: string) {
  const response = await page.request.post("/api/auth/sign-in/email", {
    headers: { "x-forwarded-for": `2001:db8:${randomUUID().slice(0, 4)}::1` },
    data: { email: email(id), password },
  });
  expect(response.ok()).toBe(true);
}

test("approves a pending account and applies role changes to existing sessions", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await login(page, adminId);
  await gotoHydrated(page, "/admin/utilisateurs");
  await expect(
    page.getByRole("heading", { name: "Administration des utilisateurs" }),
  ).toBeVisible();
  await expect(
    page.getByRole("grid", { name: "Utilisateurs Mnemo" }),
  ).toBeVisible();
  await page.getByLabel("Rechercher un utilisateur").fill(email(pendingId));
  const row = page.getByRole("row").filter({ hasText: email(pendingId) });
  await expect(row).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Approuver", exact: true }),
  ).toBeEnabled();

  const pendingContext = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const pendingPage = await pendingContext.newPage();
  try {
    await login(pendingPage, pendingId);
    await gotoHydrated(pendingPage, "/projets");
    await expect(pendingPage).toHaveURL(/compte-en-attente/);
    await expect(
      pendingPage.getByRole("heading", { name: /Votre compte est en attente/ }),
    ).toBeVisible();
    const denied = await pendingPage.request.get(
      `/api/projects/${randomUUID()}/bcf/topics`,
    );
    expect(denied.status()).toBe(401);

    await row.getByRole("button", { name: "Approuver", exact: true }).click();
    await expect(
      page.getByText("Le compte a été approuvé.", { exact: true }),
    ).toBeVisible();
    await expect(row).toHaveCount(0);
    await pendingPage
      .getByRole("button", { name: "Actualiser le statut" })
      .click();
    await expect(pendingPage).toHaveURL(/\/projets$/);
    await gotoHydrated(pendingPage, "/admin/utilisateurs");
    await expect(
      pendingPage.getByRole("heading", {
        name: "Administration des utilisateurs",
      }),
    ).toHaveCount(0);

    await page
      .getByRole("tab", { name: "Tous les utilisateurs", exact: true })
      .click();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Modifier le rôle" }).click();
    const dialog = page.getByRole("dialog", { name: "Modifier le rôle" });
    await dialog.getByLabel("Rôle du compte").selectOption("admin");
    await dialog
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(row).toContainText("Administrateur");
    await gotoHydrated(pendingPage, "/admin/utilisateurs");
    await expect(
      pendingPage.getByRole("heading", {
        name: "Administration des utilisateurs",
      }),
    ).toBeVisible();

    await page.screenshot({
      path: "/tmp/mnemo-admin-users-light.png",
      fullPage: true,
    });
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-fr-theme", "dark"),
    );
    await page.screenshot({
      path: "/tmp/mnemo-admin-users-dark.png",
      fullPage: true,
    });
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-fr-theme", "light"),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("grid", { name: "Utilisateurs Mnemo" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "/tmp/mnemo-admin-users-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });

    await row.getByRole("button", { name: "Modifier le rôle" }).click();
    await dialog.getByLabel("Rôle du compte").selectOption("user");
    await dialog
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await gotoHydrated(pendingPage, "/admin/utilisateurs");
    await expect(
      pendingPage.getByRole("heading", {
        name: "Administration des utilisateurs",
      }),
    ).toHaveCount(0);
  } finally {
    await pendingContext.close();
  }
});
