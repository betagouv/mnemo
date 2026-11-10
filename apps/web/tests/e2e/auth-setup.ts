import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { createPrismaDatabase } from "@mnemo/database";
import { hashPassword } from "better-auth/crypto";

export default async function authSetup() {
  const email = `mnemo-e2e-${randomUUID()}@example.invalid`;
  const password = `Local-test-password-${randomUUID()}`;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error("DATABASE_URL is required for E2E setup");
  const { db, close } = createPrismaDatabase({ connectionString });
  try {
    const user = await db.users.create({
      data: {
        email,
        display_name: "Test navigateur Mnemo",
        email_verified: true,
        approved_at: new Date(),
      },
    });
    await db.auth_accounts.create({
      data: {
        user_id: user.id,
        account_id: user.id,
        provider_id: "credential",
        password: await hashPassword(password),
      },
    });
  } finally {
    await close();
  }
  await writeFile(
    ".e2e-auth-account.json",
    JSON.stringify({ email, password }),
  );
}
