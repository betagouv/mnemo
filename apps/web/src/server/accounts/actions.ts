"use server";

import {
  accountQuerySchema,
  approveAccountSchema,
  updateUserRolesSchema,
  type AccountCommandResult,
} from "@mnemo/contracts/accounts";
import { resolveActor } from "@/server/auth/resolve-actor";
import { getAccountAdministration } from "./account-administration-factory";
import { AccountAdministrationError } from "./application/account-administration";

export async function listAdminUsers(input: unknown) {
  const actor = await resolveActor();
  return getAccountAdministration().list(
    actor.id,
    accountQuerySchema.parse(input),
  );
}
export async function approveAccount(
  input: unknown,
): Promise<AccountCommandResult> {
  const actor = await resolveActor();
  const { userId } = approveAccountSchema.parse(input);
  try {
    await getAccountAdministration().approve(actor.id, userId);
    return { ok: true };
  } catch (error) {
    if (error instanceof AccountAdministrationError)
      return { ok: false, error: error.message };
    throw error;
  }
}
export async function updateUserRoles(
  input: unknown,
): Promise<AccountCommandResult> {
  const actor = await resolveActor();
  const { userId, roles } = updateUserRolesSchema.parse(input);
  try {
    await getAccountAdministration().updateRoles(actor.id, userId, roles);
    return { ok: true };
  } catch (error) {
    if (error instanceof AccountAdministrationError)
      return { ok: false, error: error.message };
    throw error;
  }
}
