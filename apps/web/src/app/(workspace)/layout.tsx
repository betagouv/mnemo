import { SiteShell } from "@/widgets/site-shell";
import { getCurrentActor } from "@/server/auth/resolve-actor";
import { redirect } from "next/navigation";

export default async function ProjectWorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await getCurrentActor())) redirect("/connexion");
  return (
    <SiteShell>
      <main className="min-h-[60vh] bg-[var(--background-alt-grey)]">
        {children}
      </main>
    </SiteShell>
  );
}
