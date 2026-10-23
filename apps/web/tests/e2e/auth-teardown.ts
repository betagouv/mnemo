import { readFile, rm } from "node:fs/promises";

import { createPrismaDatabase } from "@mnemo/database";

export default async function authTeardown() {
  const account = await readFile(".e2e-auth-account.json", "utf8").catch(
    () => null,
  );
  if (account) {
    const { email } = JSON.parse(account) as { email: string };
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString)
      throw new Error("DATABASE_URL is required for E2E cleanup");
    const { db, close } = createPrismaDatabase({ connectionString });
    try {
      const user = await db.users.findUnique({
        where: { email },
        select: { id: true },
      });
      if (user) {
        await db.projects.deleteMany({ where: { created_by: user.id } });
      }
      await db.users.deleteMany({ where: { email } });
    } finally {
      await close();
    }
  }
  await rm(".e2e-auth-account.json", { force: true });
}
