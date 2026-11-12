import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { PrismaAccountRepository } from "./infrastructure/prisma-account-repository";
import {
  AccountAdministration,
  AccountAdministrationError,
} from "./application/account-administration";
import { accountQuerySchema, userRolesSchema } from "@mnemo/contracts/accounts";

const db = getRuntimePrismaDatabase();
const ids = {
  admin: randomUUID(),
  secondAdmin: randomUUID(),
  pending: randomUUID(),
  user: randomUUID(),
};
const send = vi.fn(async () => {});
const service = new AccountAdministration(
  new PrismaAccountRepository(db),
  send,
  "http://localhost:3200",
);
beforeAll(async () => {
  await db.users.createMany({
    data: Object.entries(ids).map(([kind, id]) => ({
      id,
      email: `${id}@example.invalid`,
      display_name: `Approval integration ${kind}`,
      email_verified: true,
      approved_at: kind === "pending" ? null : new Date(),
      roles:
        kind === "admin" || kind === "secondAdmin"
          ? ["user", "admin"]
          : ["user"],
    })),
  });
});
afterAll(async () => {
  await db.users.deleteMany({ where: { id: { in: Object.values(ids) } } });
});

it("denies ordinary and unapproved users every administrative operation", async () => {
  for (const actorId of [ids.user, ids.pending, randomUUID()]) {
    await expect(
      service.list(actorId, accountQuerySchema.parse({})),
    ).rejects.toBeInstanceOf(AccountAdministrationError);
    await expect(service.approve(actorId, ids.pending)).rejects.toBeInstanceOf(
      AccountAdministrationError,
    );
    await expect(
      service.updateRoles(actorId, ids.user, ["user", "admin"]),
    ).rejects.toBeInstanceOf(AccountAdministrationError);
  }
  expect(
    (await db.users.findUniqueOrThrow({ where: { id: ids.pending } }))
      .approved_at,
  ).toBeNull();
  expect(send).not.toHaveBeenCalled();
  expect(userRolesSchema.safeParse(["admin"]).success).toBe(false);
});
it("approves once with the approver id and isolates notification failures from the saved approval", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  send.mockRejectedValueOnce(new Error("Brevo unavailable"));
  await service.approve(ids.admin, ids.pending);
  await service.approve(ids.admin, ids.pending);
  expect(send).toHaveBeenCalledTimes(1);
  const account = await db.users.findUniqueOrThrow({
    where: { id: ids.pending },
  });
  expect(account.approved_by).toBe(ids.admin);
  expect(account.approved_at).toBeInstanceOf(Date);
  log.mockRestore();
});
it("filters and paginates on the server and applies role changes", async () => {
  const result = await service.list(
    ids.admin,
    accountQuerySchema.parse({ status: "all", search: ids.user, pageSize: 10 }),
  );
  expect(result.total).toBe(1);
  expect(result.users[0].id).toBe(ids.user);
  await service.updateRoles(ids.admin, ids.user, ["user", "admin"]);
  expect(
    (await db.users.findUniqueOrThrow({ where: { id: ids.user } })).roles,
  ).toEqual(["user", "admin"]);
  await service.updateRoles(ids.admin, ids.user, ["user"]);
});
it("serializes competing admin demotions and preserves the final approved administrator", async (context) => {
  // Test against the actual administrator set without modifying unrelated accounts.
  const unrelated = await db.users.count({
    where: {
      id: { notIn: Object.values(ids) },
      roles: { has: "admin" },
      email_verified: true,
      approved_at: { not: null },
    },
  });
  if (unrelated)
    context.skip("Other approved administrators are present in this database");
  const result = await Promise.allSettled([
    service.updateRoles(ids.admin, ids.secondAdmin, ["user"]),
    service.updateRoles(ids.secondAdmin, ids.admin, ["user"]),
  ]);
  expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  const remaining = await db.users.findFirstOrThrow({
    where: {
      id: { in: [ids.admin, ids.secondAdmin] },
      roles: { has: "admin" },
    },
  });
  await expect(
    service.updateRoles(remaining.id, remaining.id, ["user"]),
  ).rejects.toThrow("Conservez au moins un administrateur");
});
