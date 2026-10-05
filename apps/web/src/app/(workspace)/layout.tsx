import { WorkspaceShell } from "@/widgets/workspace-shell";

export default function ProjectWorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
