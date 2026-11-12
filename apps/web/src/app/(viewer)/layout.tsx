import { ViewerFooter } from "@/widgets/site-shell";
import { resolvePageActor } from "@/server/auth/resolve-actor";

export default async function ViewerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await resolvePageActor();
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="min-h-0 flex-1">{children}</div>
      <ViewerFooter />
    </div>
  );
}
