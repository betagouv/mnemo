import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type Actor = { id: string };

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required");
  }
}

export async function getCurrentActor(): Promise<Actor | null> {
  const requestHeaders = await headers();
  const { auth } = await import("./better-auth");
  const session = await auth.api.getSession({ headers: requestHeaders });
  return session?.user.emailVerified ? { id: session.user.id } : null;
}

export async function resolveActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) throw new AuthenticationRequiredError();
  return actor;
}

export async function resolvePageActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/connexion");
  return actor;
}
