import type { Metadata } from "next";

import { PasswordRecoveryScreen } from "@/screens/auth";

export const metadata: Metadata = { title: "Réinitialiser le mot de passe" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token } = await searchParams;
  return <PasswordRecoveryScreen token={token ?? ""} />;
}
