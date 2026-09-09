import { TrpcReactProvider } from "@/shared/api/trpc";
import { WorkspaceShell } from "@/widgets/workspace-shell";

export default function ProjectWorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <TrpcReactProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </TrpcReactProvider>
  );
}
