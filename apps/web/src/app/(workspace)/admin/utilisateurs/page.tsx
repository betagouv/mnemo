import { notFound } from "next/navigation";
import { accountQuerySchema } from "@mnemo/contracts/accounts";
import { AdminUsersScreen } from "@/screens/admin-users";
import { getCurrentAccount } from "@/server/auth/resolve-actor";
import { getAccountAdministration } from "@/server/accounts/account-administration-factory";

export const metadata = { title: "Administration des utilisateurs" };
export default async function AdminUsersPage() {
  const account = await getCurrentAccount();
  if (!account?.approved_at || !account.roles.includes("admin")) notFound();
  const query = accountQuerySchema.parse({});
  const users = await getAccountAdministration().list(account.id, query);
  return (
    <AdminUsersScreen
      actorId={account.id}
      initial={users}
      initialQuery={query}
    />
  );
}
