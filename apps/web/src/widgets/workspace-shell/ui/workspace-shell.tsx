import { SiteShell } from "@/widgets/site-shell";

export function WorkspaceShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SiteShell>
      <main className="min-h-[60vh] bg-[#f6f6f6]">{children}</main>
    </SiteShell>
  );
}
