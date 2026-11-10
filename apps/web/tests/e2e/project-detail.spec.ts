import { readFile } from "node:fs/promises";
import { createPrismaDatabase } from "@mnemo/database";
import { expect, test } from "./fixtures";
import { gotoHydrated } from "./hydration";

for (const access of ["owner", "editor", "viewer", "delete-only"] as const) {
  test(`keeps project actions scoped to ${access} permissions`, async ({
    page,
  }) => {
    const database = createPrismaDatabase({
      connectionString: process.env.DATABASE_URL!,
    });
    const { email } = JSON.parse(
      await readFile(".e2e-auth-account.json", "utf8"),
    );
    const user = await database.db.users.findUniqueOrThrow({
      where: { email },
    });
    const project = await database.db.projects.create({
      data: {
        title: `Dossier UX ${access}`,
        created_by: user.id,
        project_members: {
          create: {
            user_id: user.id,
            role: access === "delete-only" ? "viewer" : access,
            permissions:
              access === "delete-only"
                ? { create: { permission: "project:delete" } }
                : undefined,
          },
        },
      },
    });
    try {
      await gotoHydrated(page, `/projets/${project.id}`);
      const editable = access === "owner" || access === "editor";
      const deletable = access === "owner" || access === "delete-only";
      await expect(
        page.getByRole("link", { name: "Gérer les accès" }),
      ).toHaveCount(access === "owner" ? 1 : 0);
      await expect(page.locator('input[type="file"]')).toHaveCount(
        editable ? 1 : 0,
      );
      await expect(
        page.getByRole("button", { name: "Supprimer le dossier" }),
      ).toHaveCount(0);
      const edit = page.getByRole("button", { name: "Modifier le dossier" });
      await expect(edit).toHaveCount(editable || deletable ? 1 : 0);
      if (editable || deletable) {
        await edit.click();
        const dialog = page.getByRole("dialog", {
          name: "Modifier le dossier",
        });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByLabel("Titre du dossier")).toBeEnabled({
          enabled: editable,
        });
        await expect(
          dialog.getByRole("button", { name: "Enregistrer", exact: true }),
        ).toHaveCount(editable ? 1 : 0);
        await expect(
          dialog.getByRole("button", { name: "Supprimer le dossier" }),
        ).toHaveCount(deletable ? 1 : 0);
        await dialog
          .getByRole("button", { name: "Annuler", exact: true })
          .click();
      }
      if (access === "owner") {
        const upload = page.getByRole("group", {
          name: "Ajouter un fichier au projet",
        });
        await expect(upload.locator(".fr-upload")).toBeVisible();
        await expect(upload).toContainText("IFC, IFCZIP, LAS, LAZ, PLY, E57");
        await expect(upload).toContainText("5 Gio");
        const bounds = await upload.boundingBox();
        const section = await page
          .locator("section", {
            has: page.getByRole("heading", { name: "Fichiers", exact: true }),
          })
          .boundingBox();
        expect(bounds!.width).toBeCloseTo(section!.width, 0);
        await expect(upload).toContainText("Ajoutez votre premier fichier");
        await upload.evaluate((element) => {
          const transfer = new DataTransfer();
          const file = new File(["x"], "trop-grand.ifc");
          Object.defineProperty(file, "size", { value: 5 * 1024 ** 3 + 1 });
          transfer.items.add(file);
          element.dispatchEvent(
            new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer: transfer,
            }),
          );
        });
        await expect(
          page.getByRole("alert").filter({ hasText: "Le fichier doit" }),
        ).toContainText("ne pas dépasser 5 Gio");
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
            path: `/tmp/mnemo-66-${theme}.png`,
            fullPage: true,
            animations: "disabled",
          });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(upload.locator(".fr-upload")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: "/tmp/mnemo-66-mobile.png",
          fullPage: true,
          animations: "disabled",
        });
      }
    } finally {
      await database.db.projects.delete({ where: { id: project.id } });
      await database.close();
    }
  });
}
