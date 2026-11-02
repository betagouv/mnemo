import { WorkspaceShell } from "@/widgets/workspace-shell";
import { getCurrentActor } from "@/server/auth/resolve-actor";
import { redirect } from "next/navigation";

export default async function ProjectWorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await getCurrentActor())) redirect("/connexion");
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
