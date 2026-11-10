import { getCurrentAccount } from "@/server/auth/resolve-actor";

import { SiteFooter, SiteHeader } from "./site-shell";

export async function SiteShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const account = await getCurrentAccount();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        authenticated={Boolean(account)}
        isAdmin={Boolean(
          account?.approved_at && account.roles.includes("admin"),
        )}
      />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
