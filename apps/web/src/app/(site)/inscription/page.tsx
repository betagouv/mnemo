import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthScreen } from "@/screens/auth";
import { getCurrentActor } from "@/server/auth/resolve-actor";
import { safeReturnPath } from "@/shared/lib/safe-return-path";

export const metadata: Metadata = { title: "Inscription" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ retour?: string }>;
}) {
  const actor = await getCurrentActor();
  const { retour } = await searchParams;
  const returnTo = safeReturnPath(retour);
  if (actor) redirect(returnTo);
  return <AuthScreen mode="register" returnTo={returnTo} />;
}
