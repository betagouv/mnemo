import { SiteShell } from "@/widgets/site-shell";

export function WorkspaceShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SiteShell>
      <main className="min-h-[60vh] bg-[var(--background-alt-grey)]">
        {children}
      </main>
    </SiteShell>
  );
}
