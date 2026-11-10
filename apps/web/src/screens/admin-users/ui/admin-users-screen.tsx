import type { AccountQuery, AdminUserList } from "@mnemo/contracts/accounts";
import { ManageUsers } from "@/features/manage-users";

export function AdminUsersScreen(props: {
  initial: AdminUserList;
  initialQuery: AccountQuery;
  actorId: string;
}) {
  return (
    <main className="fr-container py-8">
      <h1 className="mb-3">Administration des utilisateurs</h1>
      <p className="mb-6">
        Examinez les demandes de compte et gérez les rôles. Un compte doit avoir
        une adresse e-mail confirmée et être approuvé pour accéder aux dossiers.
      </p>
      <ManageUsers {...props} />
    </main>
  );
}
