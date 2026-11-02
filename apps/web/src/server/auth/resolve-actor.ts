import { headers } from "next/headers";

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
  return session ? { id: session.user.id } : null;
}

export async function resolveActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) throw new AuthenticationRequiredError();
  return actor;
}
