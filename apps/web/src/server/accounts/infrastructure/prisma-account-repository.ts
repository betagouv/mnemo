import { Prisma, type MnemoPrismaDatabase } from "@mnemo/database";
import type { AccountQuery, UserRole } from "@mnemo/contracts/accounts";
import type {
  Account,
  AccountRepository,
} from "../application/account-repository";
import {
  AccountAdministrationError,
  requireAdministrator,
} from "../application/account-administration";

const accountSelect = {
  id: true,
  email: true,
  display_name: true,
  email_verified: true,
  roles: true,
  approved_at: true,
} as const;
type Record = Prisma.usersGetPayload<{ select: typeof accountSelect }>;
function toAccount(row: Record): Account {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    emailVerified: row.email_verified,
    roles: row.roles,
    approvedAt: row.approved_at,
  };
}
async function lockAdministration(
  tx: Prisma.TransactionClient,
  actorId: string,
) {
  // Serialize approval and privilege changes, including concurrent admin demotions.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261109, 1)`;
  const actor = await tx.users.findUnique({
    where: { id: actorId },
    select: accountSelect,
  });
  requireAdministrator(actor ? toAccount(actor) : null);
}
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly db: MnemoPrismaDatabase) {}
  async find(id: string) {
    const row = await this.db.users.findUnique({
      where: { id },
      select: accountSelect,
    });
    return row ? toAccount(row) : null;
  }
  async list(query: AccountQuery) {
    const where: Prisma.usersWhereInput = {
      ...(query.status === "pending"
        ? { approved_at: null }
        : query.status === "approved"
          ? { approved_at: { not: null } }
          : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: "insensitive" } },
              { display_name: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const field = {
      name: "display_name",
      email: "email",
      createdAt: "created_at",
    }[query.sortBy];
    const [rows, total, pendingCount] = await this.db.$transaction([
      this.db.users.findMany({
        where,
        select: { ...accountSelect, created_at: true },
        orderBy: [{ [field]: query.sortDirection }, { id: "asc" }],
        skip: query.page * query.pageSize,
        take: query.pageSize,
      }),
      this.db.users.count({ where }),
      this.db.users.count({ where: { approved_at: null } }),
    ]);
    return {
      users: rows.map((row) => ({
        id: row.id,
        name: row.display_name,
        email: row.email,
        emailVerified: row.email_verified,
        roles: row.roles,
        createdAt: row.created_at.toISOString(),
        approvedAt: row.approved_at?.toISOString() ?? null,
      })),
      total,
      pendingCount,
    };
  }
  approve(actorId: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      await lockAdministration(tx, actorId);
      const result = await tx.users.updateMany({
        where: { id: userId, approved_at: null },
        data: { approved_at: new Date(), approved_by: actorId },
      });
      if (!result.count) {
        if (!(await tx.users.count({ where: { id: userId } })))
          throw new AccountAdministrationError("Ce compte n'existe plus.");
        return null;
      }
      return toAccount(
        await tx.users.findUniqueOrThrow({
          where: { id: userId },
          select: accountSelect,
        }),
      );
    });
  }
  updateRoles(actorId: string, userId: string, roles: UserRole[]) {
    return this.db.$transaction(async (tx) => {
      await lockAdministration(tx, actorId);
      const user = await tx.users.findUnique({
        where: { id: userId },
        select: accountSelect,
      });
      if (!user)
        throw new AccountAdministrationError("Ce compte n'existe plus.");
      if (user.roles.includes("admin") && !roles.includes("admin")) {
        const count = await tx.users.count({
          where: {
            roles: { has: "admin" },
            email_verified: true,
            approved_at: { not: null },
          },
        });
        if (user.email_verified && user.approved_at && count <= 1)
          throw new AccountAdministrationError(
            "Conservez au moins un administrateur avec un compte approuvé et une adresse vérifiée.",
          );
      }
      await tx.users.update({ where: { id: userId }, data: { roles } });
    });
  }
  async administrators() {
    const rows = await this.db.users.findMany({
      where: {
        roles: { has: "admin" },
        email_verified: true,
        approved_at: { not: null },
      },
      select: accountSelect,
    });
    return rows.map(toAccount);
  }
}
