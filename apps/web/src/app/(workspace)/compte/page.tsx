import type { Metadata } from "next";

import { AccountScreen } from "@/screens/account";
import { resolveActor } from "@/server/auth/resolve-actor";
import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";

export const metadata: Metadata = { title: "Mon compte" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const actor = await resolveActor();
  const user = await getRuntimePrismaDatabase().users.findUniqueOrThrow({
    where: { id: actor.id },
    select: { display_name: true, email: true, email_verified: true },
  });
  return (
    <AccountScreen
      name={user.display_name}
      email={user.email}
      emailVerified={user.email_verified}
    />
  );
}
