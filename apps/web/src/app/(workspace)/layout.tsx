import { SiteShell } from "@/widgets/site-shell";
import { resolvePageActor } from "@/server/auth/resolve-actor";

export default async function ProjectWorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await resolvePageActor();
  return (
    <SiteShell>
      <main className="min-h-[60vh] bg-[var(--background-alt-grey)]">
        {children}
      </main>
    </SiteShell>
  );
}
