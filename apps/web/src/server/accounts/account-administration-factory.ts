import "server-only";
import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { sendTransactionalEmail } from "@/server/email/brevo-email";
import { AccountAdministration } from "./application/account-administration";
import { PrismaAccountRepository } from "./infrastructure/prisma-account-repository";

export function getAccountAdministration() {
  const baseUrl = process.env.BETTER_AUTH_URL;
  if (!baseUrl) throw new Error("BETTER_AUTH_URL is required");
  return new AccountAdministration(
    new PrismaAccountRepository(getRuntimePrismaDatabase()),
    sendTransactionalEmail,
    baseUrl,
  );
}
