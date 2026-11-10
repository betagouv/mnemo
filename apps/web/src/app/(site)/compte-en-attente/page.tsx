import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/server/auth/resolve-actor";
import { PendingAccountScreen } from "@/screens/auth";

export const metadata = { title: "Compte en attente" };
export default async function PendingAccountPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/connexion");
  if (account.approved_at) redirect("/projets");
  return <PendingAccountScreen email={account.email} />;
}
