import type {
  AccountQuery,
  AdminUserList,
  UserRole,
} from "@mnemo/contracts/accounts";

export type Account = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  roles: UserRole[];
  approvedAt: Date | null;
};
export interface AccountRepository {
  find(id: string): Promise<Account | null>;
  list(query: AccountQuery): Promise<AdminUserList>;
  approve(actorId: string, userId: string): Promise<Account | null>;
  updateRoles(
    actorId: string,
    userId: string,
    roles: UserRole[],
  ): Promise<void>;
  administrators(): Promise<Account[]>;
}
