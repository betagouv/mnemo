import { getCurrentActor } from "@/server/auth/resolve-actor";

import { SiteFooter, SiteHeader } from "./site-shell";

export async function SiteShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const actor = await getCurrentActor();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader authenticated={Boolean(actor)} />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
