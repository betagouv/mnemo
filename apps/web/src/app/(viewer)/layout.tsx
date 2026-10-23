import { ViewerFooter } from "@/widgets/site-shell";
import { getCurrentActor } from "@/server/auth/resolve-actor";
import { redirect } from "next/navigation";

export default async function ViewerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await getCurrentActor())) redirect("/connexion");
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="min-h-0 flex-1">{children}</div>
      <ViewerFooter />
    </div>
  );
}
