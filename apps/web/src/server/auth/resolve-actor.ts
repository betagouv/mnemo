import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type Actor = { id: string };

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required");
  }
}

export const getCurrentAccount = cache(async () => {
  const requestHeaders = await headers();
  const { auth } = await import("./better-auth");
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user.emailVerified) return null;
  // Read approval and roles live so existing sessions cannot retain revoked privileges.
  const { getRuntimePrismaDatabase } =
    await import("@/server/database/runtime-database");
  const account = await getRuntimePrismaDatabase().users.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      display_name: true,
      email: true,
      email_verified: true,
      roles: true,
      approved_at: true,
    },
  });
  return account?.email_verified ? account : null;
});

export async function getCurrentActor(): Promise<Actor | null> {
  const account = await getCurrentAccount();
  return account?.approved_at ? { id: account.id } : null;
}

export async function resolveActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) throw new AuthenticationRequiredError();
  return actor;
}

export async function resolvePageActor(): Promise<Actor> {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion");
  if (!account.approved_at) redirect("/compte-en-attente");
  return { id: account.id };
}
