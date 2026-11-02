import type { Metadata } from "next";

import { PasswordRecoveryScreen } from "@/screens/auth";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return <PasswordRecoveryScreen />;
}
